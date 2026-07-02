// Attribution for the NSW ePlanning open data that powers every DA lead (issue #9).
//
// The Online DA / CDC / PCC Data APIs and the DA Exhibitions register are all
// published by the NSW Department of Planning, Housing and Infrastructure under
// a Creative Commons Attribution (CC BY) licence. The licence REQUIRES us to
// attribute the source wherever we surface the data — so this single constant is
// rendered in the footer of every place DA lead data appears (the weekly digest
// email and the in-app digest view).
//
// Kept in `@/lib` (no env / server imports) so both React Server/Client
// components and the plain-string email templates can import it.

/** CC-BY attribution line required wherever NSW DA source data is surfaced. */
export const DA_SOURCE_ATTRIBUTION =
  "© State of New South Wales (Department of Planning, Housing and Infrastructure)";

/** The licence the NSW Planning Portal open data is released under. */
export const DA_SOURCE_LICENCE = "CC BY 4.0";

/** Canonical licence URL, for linking the attribution where markup allows. */
export const DA_SOURCE_LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/";
