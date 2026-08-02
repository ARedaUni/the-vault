export type TasteProfile = Record<string, number>;

export type TasteProfileReader = {
  findByUser: (userId: string) => Promise<TasteProfile>;
};
