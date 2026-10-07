import { mdiVideo2d, mdiVideo3d } from "@mdi/js";

type IconProps = { size?: number; strokeWidth?: number }
const base = (size = 20, strokeWidth = 1.8) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true })
const filledBase = (size = 20) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true })

export const CompassIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="12" r="9"/><path d="m15.4 8.6-2.1 4.7-4.7 2.1 2.1-4.7 4.7-2.1Z"/></svg>
export const FogIcon = ({ size, struck }: Pick<IconProps, "size"> & { struck: boolean }) => <svg width={size} height={size} viewBox="0 0 211.4 211.4" fill="currentColor" aria-hidden="true"><path d="M182.327 49.815c-16.482-12.067-37.006-19.272-54.901-19.272-18.011 0-31.322 7.261-39.563 21.582-6.458 11.221-9.597 26.52-9.597 46.771s3.139 35.549 9.597 46.771c8.242 14.321 21.553 21.583 39.563 21.583 17.895 0 38.418-7.205 54.901-19.272 18.748-13.727 29.073-31.157 29.073-49.081s-10.325-35.354-29.073-49.081Zm-8.861 86.06c-13.795 10.101-31.436 16.375-46.039 16.375-15.904 0-34.16-6.064-34.16-53.353 0-47.289 18.256-53.353 34.16-53.353 14.603 0 32.244 6.274 46.039 16.375C188.041 72.59 196.4 86.068 196.4 98.896s-8.359 26.307-22.934 36.979Z"/><path d="M70.765 62.288c-1.852-3.705-6.356-5.207-10.062-3.354L41.1 68.735c2.714-7.233 5.48-14.71 5.209-22.604-.142-4.14-3.61-7.386-7.753-7.238-4.14.142-7.38 3.613-7.238 7.753.172 5.007-2.031 10.878-4.364 17.093-1.621 4.319-3.448 9.191-4.474 14.307L4.148 87.212c-3.705 1.852-5.207 6.357-3.354 10.062 1.314 2.628 3.962 4.147 6.714 4.147 1.127 0 2.272-.255 3.348-.793l12.198-6.099c1.489 4.499 4.308 8.944 9.098 13.146.06.052.114.105.172.157L4.148 121.92c-3.705 1.852-5.207 6.357-3.354 10.062 1.314 2.628 3.962 4.147 6.714 4.147 1.127 0 2.272-.255 3.348-.793l26.378-13.189c-.639 3.641-2.131 7.828-4.039 12.911-.999 2.663-2.076 5.536-2.996 8.546L4.148 156.63c-3.705 1.852-5.207 6.357-3.354 10.062 1.314 2.628 3.962 4.147 6.714 4.147 1.127 0 2.272-.255 3.348-.794l17.375-8.688c.888 6.013 3.781 12.04 10.162 17.637 1.424 1.249 3.187 1.862 4.943 1.862 2.085 0 4.159-.864 5.641-2.554 2.731-3.114 2.421-7.852-.692-10.584-4.777-4.191-5.996-8.39-5.197-13.788l24.325-12.163c3.705-1.852 5.207-6.357 3.354-10.062-1.852-3.706-6.356-5.208-10.062-3.354l-11.157 5.579c2.004-5.996 3.586-12.635 2.744-19.311l15.122-7.561c3.705-1.852 5.207-6.357 3.354-10.062-1.852-3.705-6.356-5.208-10.062-3.354l-14.382 7.191c-1.213-1.502-2.623-2.983-4.278-4.435-3.181-2.79-4.78-5.585-5.261-8.734L67.411 72.35c3.705-1.852 5.207-6.357 3.354-10.062Z"/>{struck && <path d="M19 19 192.4 192.4" fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round"/>}</svg>
export const LocateIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
export const LocationOffIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/><path d="M4 4l16 16"/></svg>
export const RouteIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/></svg>
export const DirectionsIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><path d="M14 5 21 12l-7 7v-4H8.5A4.5 4.5 0 0 0 4 19.5V18a8 8 0 0 1 8-8h2V5Z"/></svg>
export const ViewDimensionIcon = ({ size, dimension }: Pick<IconProps, "size"> & { dimension: "2d" | "3d" }) => <svg {...filledBase(size)}><path d={dimension === "3d" ? mdiVideo3d : mdiVideo2d}/></svg>
export const UserIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>
export const InfoIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>
export const StarIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>
export const SaveIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>
export const XIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><path d="m6 6 12 12M18 6 6 18"/></svg>
export const ChevronIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><path d="m9 18 6-6-6-6"/></svg>

export function HecateMark({ size = 30 }: { size?: number }) {
  return <svg className="hecate-mark" width={size} height={size} viewBox="0 0 32 36" fill="none" aria-hidden="true">
    <path className="hecate-mark__flame" d="M16 2.2c-3.7 4.2-2.1 6.7-5.2 9.6-3.7 3.5-2.5 9.8 2.6 11.8-1.3-3.7.5-6.5 3.4-9.1-.2 3.3 3.4 4.8 1.8 9.1 5.2-1.9 6.9-7.4 3.7-11.7-2.6-3.4-2.7-6.5-2-8.8-2.1 1.8-3.4 3.8-3.9 5.8-.8-2.4-.7-4.6-.4-6.7Z"/>
    <path className="hecate-mark__ember" d="M16.3 14.8c-1.7 2-2.8 3.8-1.5 6.4 2.6-.4 4.2-2.8 2.8-5.4-.4-.8-.8-1.5-.8-2.4l-.5 1.4Z"/>
    <path className="hecate-mark__bowl" d="M9.2 23h13.6l-2.2 4.3h-9.2L9.2 23Z"/>
    <path className="hecate-mark__handle" d="M13 27.3h6l1.6 6.5-4.6-2-4.6 2 1.6-6.5Z"/>
  </svg>
}
