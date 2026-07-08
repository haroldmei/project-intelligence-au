-- Send-time service-area snapshot on each digest (issue #138). The history list
-- and digest-detail header derived the area label from the user's LIVE area and
-- stamped it onto every past digest, so widening your area retroactively
-- relabelled old digests as covering LGAs they never sourced. This column freezes
-- the area label at send time. Nullable — digests sent before this column existed
-- stay NULL and the portal falls back to the live area only for those.
ALTER TABLE "digests" ADD COLUMN "area_label" TEXT;
