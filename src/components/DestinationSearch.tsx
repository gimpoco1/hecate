import { useEffect, useRef, useState } from "react";
import { searchDestinations, type DestinationResult } from "../destinationSearch";
import type { RoutePoint } from "../explorationRouting";

type Props = { near: RoutePoint | null; onSelect: (result: DestinationResult) => void };

export function DestinationSearch({ near, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DestinationResult[]>([]);
  const [pending, setPending] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const search = async (): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true); setError(""); setResults([]); setSearched(false);
    try {
      const found = await searchDestinations(query, near, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found); setSearched(true);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Destination search failed. Try again.");
    } finally { if (!controller.signal.aborted) setPending(false); }
  };

  return <div className="destination-search">
    <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <input type="search" aria-label="Search for a destination" placeholder="Search a place or address" value={query}
        onChange={(event) => { controllerRef.current?.abort(); setPending(false); setQuery(event.target.value); setResults([]); setSearched(false); setError(""); }} />
      <button type="submit" disabled={pending || query.trim().length < 3}>{pending ? "Searching…" : "Search"}</button>
    </form>
    {error && <p className="exploration-route-error" role="alert">{error}</p>}
    {searched && results.length === 0 && <p role="status">No destinations found. Try a more specific name or address.</p>}
    <div className="destination-search-results">
      {results.map((result) => <button type="button" key={result.id} aria-label={`Choose destination: ${result.name}`} onClick={() => { setResults([]); setSearched(false); setQuery(result.name); onSelect(result); }}><strong>{result.name}</strong><small>{result.detail}</small></button>)}
    </div>
  </div>;
}
