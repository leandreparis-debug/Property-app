/**
 * Hand-written SVG charts (no chart library, no dependency): every chart has
 * a title and an accessible text or table equivalent, uses the accent color
 * for the main series and neutral shades otherwise — status colors are
 * reserved for the compliance status. See docs/design-system.md.
 */
export { BreakdownBar, type BreakdownSegment } from "./BreakdownBar";
export { LeaseTimeline, type LeaseTimelineProps } from "./LeaseTimeline";
export { TrendChart, type TrendChartProps, type TrendPoint, type TrendSeries } from "./TrendChart";
export { linearScale, niceTicks } from "./scale";
