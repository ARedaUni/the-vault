export type TasteProfile = Record<string, number>;

export interface TasteProfileReader {
  findByUser(userId: string): Promise<TasteProfile>;
}
