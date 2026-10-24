import { RouteNotice } from "./RouteNotice";
import { ChevronIcon, RouteIcon, TrashIcon } from "./Icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { searchDestinations, type DestinationResult } from "../destinationSearch";
import type { RoutePoint } from "../explorationRouting";
import { cityPointPredicate, type CityBoundary } from "../city";

type Props = { recent: readonly DestinationResult[] | null; historyError: string; onClearHistory: () => void; onRemoveRecent: (result: DestinationResult) => void; destination: RoutePoint | null; near: RoutePoint | null; city: CityBoundary | null; onSelect: (result: DestinationResult) => void };

export function DestinationSearch({ recent, historyError, onClearHistory, onRemoveRecent, destination, near, city, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [selectedResult, setSelectedResult] = useState<DestinationResult | null>(null);
  const [results, setResults] = useState<DestinationResult[]>([]);
  const [pending, setPending] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const selectDestination = (result: DestinationResult): void => {
    controllerRef.current?.abort();
    setResults([]); setSearched(false); setQuery(result.name); setSelectedResult(result);
    onSelect(result);
  };

  const contains = city ? cityPointPredicate(city) : null;
  const visibleRecent = contains ? (recent ?? []).filter(({ point }) => contains(point)).slice(0, 3) : [];

  return <div className="destination-search">
    <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <div className="destination-search-field">
      <input ref={inputRef} type="search" aria-label="Search for a destination" placeholder={city ? `Search in ${city.name}` : "Search a place or address"} value={query} disabled={!city} autoComplete="off"
        onChange={(event) => { controllerRef.current?.abort(); setSelectedResult(null); setPending(false); setQuery(event.target.value); setSearched(false); setError(""); }} />
      {query && <button className="destination-search-clear" type="button" aria-label="Clear destination search" onPointerDown={(event) => event.preventDefault()} onClick={() => {
        controllerRef.current?.abort();
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        setQuery(""); setSelectedResult(null); setResults([]); setPending(false); setSearched(false); setError("");
        inputRef.current?.focus();
      }}>Clear</button>}
      </div>
      <button type="submit" disabled={!city || pending || query.trim().length < 3}>{pending ? "Searching…" : "Search"}</button>
    </form>
    {!city && <p className="exploration-route-caption" role="status">Find your location to search within your current city, or choose a point on the map.</p>}
    {historyError && <RouteNotice title="Recent destinations unavailable" message={historyError} action={<button className="route-notice-action" type="button" onClick={onClearHistory}>Clear history</button>} />}
    {error && <RouteNotice title="Search unavailable" message={error} action={<button className="route-notice-action" type="button" aria-label="Retry destination search" onClick={() => void search()}>Retry</button>} />}
    {searched && results.length === 0 && city && <p className="exploration-route-caption" role="status">No places found in {city.name}. Check the address or try another name.</p>}
    {!destination && !query.trim() && visibleRecent.length > 0 && <section className="destination-recent" aria-label="Recent destinations">
      <div className="destination-recent-heading"><strong>Recent destinations</strong><button type="button" aria-label="Clear destination history" onClick={onClearHistory}>Clear history</button></div>
      <div className="destination-search-results">{visibleRecent.map((result) => <div className="destination-recent-row" key={`${result.point.lng}:${result.point.lat}`}>
        <div className="destination-recent-track">
        <button type="button" aria-label={`Choose recent destination: ${result.name}, ${result.detail}`} title={`${result.name} · ${result.detail}`} onClick={() => selectDestination(result)}><RouteIcon size={16} /><strong>{result.name}</strong><ChevronIcon size={14} /></button>
        <button className="destination-recent-remove" type="button" aria-label={`Remove recent destination: ${result.name}`} onClick={() => onRemoveRecent(result)}><TrashIcon size={18} /></button>
        </div>
      </div>)}</div>
    </section>}
    <div className="destination-search-results" aria-label="Destination suggestions" aria-busy={pending}>
      {results.map((result) => <button type="button" key={result.id} aria-label={`Choose destination: ${result.name}`} onClick={() => selectDestination(result)}><strong>{result.name}</strong><small>{result.detail}</small></button>)}
    </div>
  </div>;
}
