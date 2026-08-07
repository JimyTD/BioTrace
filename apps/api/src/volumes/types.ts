import type { TaxonomyRank } from "../identify/types.js";

export type TaxonomyInRule = {
  type: "taxonomy_in";
  rank: TaxonomyRank | string;
  names: string[];
  /** Observation finest_reliable_rank must be at least this fine. */
  minReliableRank: TaxonomyRank | string;
};

export type VolumeSlotRule = TaxonomyInRule;

export type VolumeSlotConfig = {
  id: string;
  titleKey: string;
  rule: VolumeSlotRule;
};

export type VolumeConfig = {
  id: string;
  sort?: number;
  enabled?: boolean;
  titleKey: string;
  ledeKey: string;
  slots: VolumeSlotConfig[];
};

export type VolumeProgressRow = {
  userId: string;
  volumeId: string;
  litSlotIds: string[];
  completedAt: Date | null;
};
