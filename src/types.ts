export type Game = {
  name: string;
  minPlayers: number;
  maxPlayers: number;
  players: string;
};

export type BatchPendingData = {
  gameNames: string[];
  index: number;
  selections: { name: string; min: number; max: number }[];
  currentGameName?: string;
  awaiting?: 'min' | 'max';
  tempMin?: number;
};
