type IconProps = { size?: number; strokeWidth?: number }
const base = (size = 20, strokeWidth = 1.8) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true })

export const CompassIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="12" r="9"/><path d="m15.4 8.6-2.1 4.7-4.7 2.1 2.1-4.7 4.7-2.1Z"/></svg>
export const MapIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z"/><path d="M8 4v13M16 7v13"/></svg>
export const LocateIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
export const LocationOffIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/><path d="M4 4l16 16"/></svg>
export const RouteIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/></svg>
export const PerspectiveIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><path d="m3 8 9-5 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>
export const UserIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>
export const InfoIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>
export const StarIcon = ({ size, strokeWidth }: IconProps) => <svg {...base(size, strokeWidth)}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>
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
