import { useCallback, useEffect, useRef, useState } from "react";
import { searchDestinations, type DestinationResult } from "../destinationSearch";
import type { RoutePoint } from "../explorationRouting";
import { cityPointPredicate, type CityBoundary } from "../city";
import { clearRecentDestinations, loadRecentDestinations, saveRecentDestinations, withRecentDestination } from "../recentDestinations";

type Props = { userId: string | null; destination: RoutePoint | null; near: RoutePoint | null; city: CityBoundary | null; onSelect: (result: DestinationResult) => void };

export function DestinationSearch({ userId, destination, near, city, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<DestinationResult[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    try { setRecent(loadRecentDestinations(userId)); setHistoryError(""); }
    catch (cause) {
      console.error("Could not load recent destinations", { userId, cause });
      setRecent(null); setHistoryError(cause instanceof Error ? cause.message : "Could not load recent destinations.");
    }
  }, [userId]);
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

  const selectDestination = (result: DestinationResult): void => {
    controllerRef.current?.abort();
    setResults([]); setSearched(false); setQuery(result.name); setSelectedResult(result);
    try {
      const updated = withRecentDestination(recent ?? loadRecentDestinations(userId), result);
      saveRecentDestinations(userId, updated);
      setRecent(updated); setHistoryError("");
    } catch (cause) {
      console.error("Could not save recent destination", { userId, cause });
      setHistoryError(cause instanceof Error ? cause.message : "Could not save recent destination.");
    }
    onSelect(result);
  };

  const clearHistory = (): void => {
    try { clearRecentDestinations(userId); setRecent([]); setHistoryError(""); }
    catch (cause) {
      console.error("Could not clear recent destinations", { userId, cause });
      setHistoryError(cause instanceof Error ? cause.message : "Could not clear recent destinations.");
    }
  };
  const contains = city ? cityPointPredicate(city) : null;
  const visibleRecent = contains ? (recent ?? []).filter(({ point }) => contains(point)) : [];

  return <div className="destination-search">
    <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <input type="search" aria-label="Search for a destination" placeholder={city ? `Search in ${city.name}` : "Search a place or address"} value={query} disabled={!city} autoComplete="off"
        onChange={(event) => { controllerRef.current?.abort(); setSelectedResult(null); setPending(false); setQuery(event.target.value); setSearched(false); setError(""); }} />
      <button type="submit" disabled={!city || pending || query.trim().length < 3}>{pending ? "Searching…" : "Search"}</button>
    </form>
    {!city && <p className="exploration-route-caption" role="status">Find your location to search within your current city, or choose a point on the map.</p>}
    {historyError && <p className="exploration-route-error" role="alert">Recent searches: {historyError}</p>}
    {error && <p className="exploration-route-error" role="alert">{error}</p>}
    {searched && results.length === 0 && city && <p className="exploration-route-caption" role="status">No places found in {city.name}. Check the address or try another name.</p>}
    {!destination && !query.trim() && (visibleRecent.length > 0 || historyError) && <section className="destination-recent" aria-label="Recent destinations">
      <div className="destination-recent-heading"><strong>Recent destinations</strong><button type="button" aria-label="Clear destination history" onClick={clearHistory}>Clear history</button></div>
      <div className="destination-search-results">{visibleRecent.map((result) => <button type="button" key={`${result.point.lng}:${result.point.lat}`} aria-label={`Choose recent destination: ${result.name}`} onClick={() => selectDestination(result)}><strong>{result.name}</strong><small>{result.detail}</small></button>)}</div>
    </section>}
    <div className="destination-search-results" aria-label="Destination suggestions" aria-busy={pending}>
      {results.map((result) => <button type="button" key={result.id} aria-label={`Choose destination: ${result.name}`} onClick={() => selectDestination(result)}><strong>{result.name}</strong><small>{result.detail}</small></button>)}
    </div>
  </div>;
}
