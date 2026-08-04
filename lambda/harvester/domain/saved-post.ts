export type SavedPost = {
  redditId: string;
  imageUrl: string;
};

export type SavedPostSource = {
  fetchSaved: () => Promise<readonly SavedPost[]>;
};
