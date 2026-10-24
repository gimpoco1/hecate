import type { ReactNode } from "react";
import { InfoIcon } from "./Icons";

type Props = { title: string; message: string; action: ReactNode };

export function RouteNotice({ title, message, action }: Props) {
  return <div className="route-notice" role="alert">
    <InfoIcon size={17} />
    <div className="route-notice-content">
      <div className="route-notice-heading"><strong>{title}</strong>{action}</div>
      <p>{message}</p>
    </div>
  </div>;
}
