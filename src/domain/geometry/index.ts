/**
 * Hand-written planar geometry (no dependency), in Web Mercator metres for
 * everything local to a site. Pure functions, fully unit-tested.
 */
export * from "./mercator";
export { convexHull, cross, signedArea } from "./hull";
export { orientedBoundingBox, type OrientedBox } from "./obb";
export { clipPolygons, clipRing, closeRing, openRing, polygonsArea, type PolygonRings, type Ring } from "./clip";
export { applyAffine, DegenerateControlPointsError, invertAffine, solveAffine, type Affine, type AffineSolution, type ControlPoint } from "./affine";
/** Geodesic area of a WGS 84 footprint (step 8), re-exported. */
export { geodesicArea } from "../geo/area";
