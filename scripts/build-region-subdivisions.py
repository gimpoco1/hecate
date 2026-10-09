#!/usr/bin/env python3
"""Build a versioned subdivision package for one Hecate region from Overture."""

from __future__ import annotations

import argparse
import json
import time
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypedDict, cast

import duckdb
from shapely import from_wkb
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union


SubdivisionKind = Literal["municipality", "district", "neighborhood"]


class BBox(TypedDict):
    xmin: float
    xmax: float
    ymin: float
    ymax: float


class SourceDivision(TypedDict):
    id: str
    parent_id: str | None
    name: str
    subtype: str
    local_type: str | None
    hierarchy_ids: list[str]
    geometry: BaseGeometry


class OutputArea(TypedDict):
    id: str
    parentId: str | None
    kind: SubdivisionKind
    name: str
    geometry: dict[str, object]


@dataclass(frozen=True)
class Arguments:
    release: str
    country: str
    region_id: str
    region_geometry: Path
    output: Path
    simplify_degrees: float


def parse_arguments() -> Arguments:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", required=True)
    parser.add_argument("--country", required=True)
    parser.add_argument("--region-id", required=True)
    parser.add_argument("--region-geometry", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--simplify-degrees", type=float, required=True)
    values = parser.parse_args()
    if values.simplify_degrees <= 0:
        raise ValueError("--simplify-degrees must be greater than zero")
    return Arguments(
        release=values.release,
        country=values.country.upper(),
        region_id=values.region_id,
        region_geometry=values.region_geometry,
        output=values.output,
        simplify_degrees=values.simplify_degrees,
    )


def load_region_geometry(path: Path) -> BaseGeometry:
    if not path.is_file():
        raise FileNotFoundError(f"Region geometry does not exist: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("type") not in {
        "Polygon",
        "MultiPolygon",
    }:
        raise ValueError(f"Region geometry must be a Polygon or MultiPolygon: {path}")
    geometry = shape(value)
    if geometry.is_empty or not geometry.is_valid:
        raise ValueError(f"Region geometry is empty or invalid: {path}")
    return geometry


def bounds_for_geometry(geometry: BaseGeometry) -> BBox:
    xmin, ymin, xmax, ymax = geometry.bounds
    return {"xmin": xmin, "xmax": xmax, "ymin": ymin, "ymax": ymax}


def overture_path(release: str, feature_type: str) -> str:
    return (
        "s3://overturemaps-us-west-2/release/"
        f"{release}/theme=divisions/type={feature_type}/*"
    )


def connect_to_overture() -> duckdb.DuckDBPyConnection:
    connection = duckdb.connect()
    connection.execute("INSTALL httpfs; LOAD httpfs")
    return connection


def fetch_source_divisions(
    connection: duckdb.DuckDBPyConnection,
    release: str,
    country: str,
    bounds: BBox,
) -> list[SourceDivision]:
    division_path = overture_path(release, "division")
    area_path = overture_path(release, "division_area")
    rows = connection.execute(
        f"""
        WITH divisions AS (
          SELECT
            id,
            parent_division_id,
            names.primary AS name,
            subtype,
            map_extract_value(local_type, 'en') AS local_type,
            hierarchies,
            bbox
          FROM read_parquet(?, hive_partitioning=1)
          WHERE country = ?
            AND bbox.xmin <= ? AND bbox.xmax >= ?
            AND bbox.ymin <= ? AND bbox.ymax >= ?
            AND subtype IN (
              'locality', 'localadmin', 'borough', 'macrohood',
              'neighborhood', 'microhood'
            )
        ),
        areas AS (
          SELECT division_id, geometry
          FROM read_parquet(?, hive_partitioning=1)
          WHERE country = ?
            AND is_land = true
            AND bbox.xmin <= ? AND bbox.xmax >= ?
            AND bbox.ymin <= ? AND bbox.ymax >= ?
        )
        SELECT
          divisions.id,
          divisions.parent_division_id,
          divisions.name,
          divisions.subtype,
          divisions.local_type,
          divisions.hierarchies,
          areas.geometry
        FROM divisions
        JOIN areas ON areas.division_id = divisions.id
        WHERE divisions.name IS NOT NULL
        """,
        [
            division_path,
            country,
            bounds["xmax"],
            bounds["xmin"],
            bounds["ymax"],
            bounds["ymin"],
            area_path,
            country,
            bounds["xmax"],
            bounds["xmin"],
            bounds["ymax"],
            bounds["ymin"],
        ],
    ).fetchall()
    divisions: list[SourceDivision] = []
    for identifier, parent_id, name, subtype, local_type, hierarchies, wkb in rows:
        if not isinstance(identifier, str) or not isinstance(name, str):
            raise ValueError("Overture returned a division without a valid ID or name")
        hierarchy_ids = [
            item["division_id"]
            for hierarchy in hierarchies or []
            for item in hierarchy
            if isinstance(item.get("division_id"), str)
        ]
        geometry = from_wkb(bytes(wkb))
        if geometry.is_empty or not geometry.is_valid:
            raise ValueError(f"Overture returned invalid geometry for division {identifier}")
        divisions.append(
            {
                "id": identifier,
                "parent_id": parent_id,
                "name": name,
                "subtype": subtype,
                "local_type": local_type,
                "hierarchy_ids": hierarchy_ids,
                "geometry": geometry,
            }
        )
    return divisions


def fetch_source_divisions_with_retries(
    connection: duckdb.DuckDBPyConnection,
    release: str,
    country: str,
    bounds: BBox,
    attempts: int,
) -> list[SourceDivision]:
    if attempts < 1:
        raise ValueError("attempts must be greater than zero")
    last_error: duckdb.Error | None = None
    for attempt in range(1, attempts + 1):
        try:
            return fetch_source_divisions(connection, release, country, bounds)
        except duckdb.Error as error:
            last_error = error
            if attempt == attempts:
                break
            warnings.warn(
                json.dumps(
                    {
                        "event": "overture_query_retry",
                        "attempt": attempt,
                        "release": release,
                        "country": country,
                        "bounds": bounds,
                        "error": str(error),
                    }
                ),
                stacklevel=2,
            )
            time.sleep(attempt)
    if last_error is None:
        raise RuntimeError("Overture query failed without returning an error")
    raise last_error


def is_inside_region(geometry: BaseGeometry, region: BaseGeometry) -> bool:
    return region.covers(geometry.representative_point())


def containing_municipality_id(
    geometry: BaseGeometry,
    municipalities: list[SourceDivision],
) -> str | None:
    point = geometry.representative_point()
    containing = [
        municipality
        for municipality in municipalities
        if municipality["geometry"].covers(point)
    ]
    if not containing:
        return None
    return min(containing, key=lambda item: item["geometry"].area)["id"]


def select_hierarchy(
    divisions: list[SourceDivision],
    region: BaseGeometry,
) -> tuple[list[SourceDivision], list[tuple[SourceDivision, str]], list[SourceDivision]]:
    municipalities = [
        division
        for division in divisions
        if division["subtype"] == "locality"
        and division["local_type"] in {"city", "town", "municipality", "village"}
        and is_inside_region(division["geometry"], region)
    ]
    municipality_ids = {division["id"] for division in municipalities}
    districts: list[tuple[SourceDivision, str]] = []
    for division in divisions:
        if division["subtype"] not in {"borough", "macrohood", "localadmin"}:
            continue
        if division["local_type"] not in {"borough", "district", "suburb"}:
            continue
        parent_id = (
            division["parent_id"]
            if division["parent_id"] in municipality_ids
            else containing_municipality_id(division["geometry"], municipalities)
        )
        if parent_id is not None:
            districts.append((division, parent_id))

    district_ids = {division["id"] for division, _ in districts}
    neighborhoods = [
        division
        for division in divisions
        if division["parent_id"] in district_ids
        and division["local_type"] == "quarter"
    ]
    return municipalities, districts, neighborhoods


def neighborhoods_with_complete_coverage(
    districts: list[tuple[SourceDivision, str]],
    neighborhoods: list[SourceDivision],
    minimum_coverage: float,
) -> list[SourceDivision]:
    if minimum_coverage <= 0 or minimum_coverage > 1:
        raise ValueError("minimum_coverage must be greater than zero and at most one")
    accepted: list[SourceDivision] = []
    for district, _ in districts:
        children = [
            neighborhood
            for neighborhood in neighborhoods
            if neighborhood["parent_id"] == district["id"]
        ]
        if not children:
            continue
        covered_area = unary_union(
            [child["geometry"] for child in children]
        ).intersection(district["geometry"])
        coverage = covered_area.area / district["geometry"].area
        if coverage >= minimum_coverage:
            accepted.extend(children)
            continue
        warnings.warn(
            json.dumps(
                {
                    "event": "incomplete_neighborhood_coverage",
                    "districtId": district["id"],
                    "districtName": district["name"],
                    "coverage": coverage,
                    "minimumCoverage": minimum_coverage,
                }
            ),
            stacklevel=2,
        )
    return accepted


def simplified_geometry(
    geometry: BaseGeometry,
    tolerance: float,
) -> dict[str, object]:
    simplified = geometry.simplify(tolerance, preserve_topology=True)
    if simplified.is_empty or not simplified.is_valid:
        raise ValueError("Geometry simplification produced an invalid polygon")
    return cast(dict[str, object], mapping(simplified))


def output_area(
    division: SourceDivision,
    parent_id: str | None,
    kind: SubdivisionKind,
    tolerance: float,
) -> OutputArea:
    return {
        "id": f"overture:{division['id']}",
        "parentId": f"overture:{parent_id}" if parent_id is not None else None,
        "kind": kind,
        "name": division["name"],
        "geometry": simplified_geometry(division["geometry"], tolerance),
    }


def build_output(
    arguments: Arguments,
    municipalities: list[SourceDivision],
    districts: list[tuple[SourceDivision, str]],
    neighborhoods: list[SourceDivision],
) -> dict[str, object]:
    areas: list[OutputArea] = []
    areas.extend(
        output_area(
            municipality,
            None,
            "municipality",
            arguments.simplify_degrees,
        )
        for municipality in municipalities
    )
    areas.extend(
        output_area(
            district,
            municipality_id,
            "district",
            arguments.simplify_degrees,
        )
        for district, municipality_id in districts
    )
    areas.extend(
        output_area(
            neighborhood,
            neighborhood["parent_id"],
            "neighborhood",
            arguments.simplify_degrees,
        )
        for neighborhood in neighborhoods
    )
    areas.sort(key=lambda area: (area["kind"], area["name"]))
    return {
        "regionId": arguments.region_id,
        "datasetVersion": arguments.release,
        "attribution": "© OpenStreetMap contributors, Overture Maps Foundation",
        "areas": areas,
    }


def write_output(path: Path, value: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> None:
    arguments = parse_arguments()
    region = load_region_geometry(arguments.region_geometry)
    connection = connect_to_overture()
    try:
        divisions = fetch_source_divisions_with_retries(
            connection,
            arguments.release,
            arguments.country,
            bounds_for_geometry(region),
            3,
        )
    finally:
        connection.close()
    municipalities, districts, neighborhoods = select_hierarchy(divisions, region)
    neighborhoods = neighborhoods_with_complete_coverage(
        districts,
        neighborhoods,
        0.95,
    )
    if not districts:
        raise ValueError(
            f"No validated districts were found for region {arguments.region_id}"
        )
    write_output(
        arguments.output,
        build_output(arguments, municipalities, districts, neighborhoods),
    )
    print(
        json.dumps(
            {
                "regionId": arguments.region_id,
                "municipalities": len(municipalities),
                "districts": len(districts),
                "neighborhoods": len(neighborhoods),
                "output": str(arguments.output),
            }
        )
    )


if __name__ == "__main__":
    main()
