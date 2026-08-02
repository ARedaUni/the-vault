export type TasteProfileRepository = {
  incrementTag: (options: { userId: string; tag: string }) => Promise<void>;
};
