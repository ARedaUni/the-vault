export interface TasteProfileRepository {
  incrementTag(options: { userId: string; tag: string }): Promise<void>;
}
