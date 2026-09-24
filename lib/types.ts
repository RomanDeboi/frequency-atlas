export type CategoryKey =
  | "uav"
  | "wifi"
  | "bluetooth"
  | "cellular"
  | "gnss"
  | "vhf"
  | "uhf"
  | "other";

export type FrequencyBand = {
  id: string;
  entityName: string;
  bandName: string;
  category: CategoryKey;
  startMHz: number;
  endMHz: number;
  purpose: string;
  technology?: string;
  description: string;
  tags: string[];
  screenshotCount?: number;
};
