export type SavedPost = {
  source: string;
  externalId: string;
  imageUrl: string;
};

export interface SavedPostSource {
  fetchSaved(): Promise<readonly SavedPost[]>;
}
