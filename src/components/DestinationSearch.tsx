import { useCallback, useEffect, useRef, useState } from "react";
import { searchDestinations, type DestinationResult } from "../destinationSearch";
import type { RoutePoint } from "../explorationRouting";
import type { CityBoundary } from "../city";

type Props = { near: RoutePoint | null; city: CityBoundary | null; onSelect: (result: DestinationResult) => void };

export function DestinationSearch({ near, city, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [selectedResult, setSelectedResult] = useState<DestinationResult | null>(null);
  const [results, setResults] = useState<DestinationResult[]>([]);
  const [pending, setPending] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const resultsCityIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearRef = useRef(near);
  nearRef.current = near;

  const search = useCallback(async (): Promise<void> => {
    if (!city || query.trim().length < 3) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true); setError(""); setSearched(false);
    try {
      const found = await searchDestinations(query, nearRef.current, city, controller.signal);
      if (controller.signal.aborted) return;
      resultsCityIdRef.current = city.id;
      setResults(found); setSearched(true);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Destination search failed. Try again.");
    } finally { if (!controller.signal.aborted) setPending(false); }
  }, [query, city]);

  useEffect(() => {
    controllerRef.current?.abort();
    setPending(false); setSearched(false); setError("");
    if (!city || query.trim().length < 3 || city.id !== resultsCityIdRef.current) setResults([]);
    if (city && query.trim().length >= 3 && query !== selectedResult?.name) {
      timerRef.current = setTimeout(() => { void search(); }, 400);
    }
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, [search, city, query, selectedResult]);

  return <div className="destination-search">
    <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <input type="search" aria-label="Search for a destination" placeholder={city ? `Search in ${city.name}` : "Search a place or address"} value={query} disabled={!city} autoComplete="off"
        onChange={(event) => { controllerRef.current?.abort(); setSelectedResult(null); setPending(false); setQuery(event.target.value); setSearched(false); setError(""); }} />
      <button type="submit" disabled={!city || pending || query.trim().length < 3}>{pending ? "Searching…" : "Search"}</button>
    </form>
    {!city && <p className="exploration-route-caption" role="status">Find your location to search within your current city, or choose a point on the map.</p>}
    {error && <p className="exploration-route-error" role="alert">{error}</p>}
    {searched && results.length === 0 && city && <p className="exploration-route-caption" role="status">No places found in {city.name}. Check the address or try another name.</p>}
    <div className="destination-search-results" aria-label="Destination suggestions" aria-busy={pending}>
      {results.map((result) => <button type="button" key={result.id} aria-label={`Choose destination: ${result.name}`} onClick={() => { controllerRef.current?.abort(); setResults([]); setSearched(false); setQuery(result.name); setSelectedResult(result); onSelect(result); }}><strong>{result.name}</strong><small>{result.detail}</small></button>)}
    </div>
  </div>;
}
