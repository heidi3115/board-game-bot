import fs from 'fs';
import { Game } from './types';

const DATA_PATH = './gameList.json';

export function loadGameList(): Game[] {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify([], null, 2), 'utf-8');
    return [];
  }
  const data = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(data);
}

export function saveGameList(gameList: Game[]) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(gameList, null, 2), 'utf-8');
}
