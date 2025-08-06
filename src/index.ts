import { Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Events,
  InteractionType,
  CacheType,
  StringSelectMenuInteraction, } from 'discord.js';
import { Game } from './types';
import { loadGameList, saveGameList } from './storage';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 메모리 보드게임 목록 (서버별로 관리하려면 Map 등으로 확장 필요)
let gameList: Game[] = loadGameList();

const pendingBatchMap = new Map<string, {
  gameNames: string[];
  index: number;
  selections: { name: string; min: number; max: number }[];
  currentGameName?: string;
  awaiting?: 'min' | 'max';
  tempMin?: number;
}>();

client.once('ready', () => {
  console.log(`🤖 봇 로그인 완료: ${client.user?.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // !등록 게임명
  if (content.startsWith('!등록 ')) {
  const gameNames = content
    .slice(4)
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0);

  if (gameNames.length === 0) {
    await message.channel.send('❌ 등록할 게임명을 1개 이상 입력해주세요. (예: `!등록 가이아, 루트`)');
    return;
  }

  pendingBatchMap.set(message.author.id, {
    gameNames,
    index: 0,
    selections: [],
    awaiting: 'min',
  });

  // 첫 번째 게임의 이름
  const currentGameName = gameNames[0];

  const options = [];
  for (let i = 2; i <= 10; i++) {
    options.push({
      label: `${i}명`,
      description: `${i}명의 플레이어`,
      value: `${i}`,
    });
  }

  const minSelect = new StringSelectMenuBuilder()
    .setCustomId(`batchSelectMin_${currentGameName}`)
    .setPlaceholder(`[${currentGameName}] 최소 인원을 선택하세요`)
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(minSelect);

  await message.channel.send({
    content: `🎮 [${currentGameName}] 게임의 **최소 인원**을 선택해주세요.`,
    components: [row],
  });

  return;
}

  // !목록
if (content.startsWith('!목록')) {
  const args = content.split(' ');
  const pageArg = args[1] ?? '1';  // undefined면 '1'로 처리
  const page = parseInt(pageArg, 10) || 1;
  const pageSize = 30;
  const totalPages = Math.ceil(gameList.length / pageSize);

  if (gameList.length === 0) {
    await message.channel.send('📝 등록된 게임이 없습니다.');
    return;
  }

  if (page < 1 || page > totalPages) {
    await message.channel.send(`❌ 페이지 번호가 올바르지 않습니다. 1부터 ${totalPages} 사이 숫자를 입력하세요.`);
    return;
  }

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const pageGames = gameList.slice(startIndex, endIndex);

  let reply = `📝 등록된 게임 목록 (페이지 ${page} / ${totalPages}):\n\n`;
  for (const g of pageGames) {
    reply += `* ${g.name} (${g.players}명)\n`;
  }

  await message.channel.send(reply);
}


  // !삭제 게임명
  if (content.startsWith('!삭제 ')) {
    const gameName = content.slice(4).trim();
    const index = gameList.findIndex((g) => g.name === gameName);
  if (index === -1) {
    message.channel.send(`❌ 목록에 "${gameName}" 게임이 없어요.`);
    return;
  }
  gameList.splice(index, 1);

  // 저장
  saveGameList(gameList);

  message.channel.send(`🗑️ "${gameName}" 게임이 목록에서 삭제됐어요.`);
  return;
}

});

const pendingSelections = new Map<string, { min?: number; max?: number }>();

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  const userId = interaction.user.id;
  const batch = pendingBatchMap.get(userId);
  if (!batch) return;

  const { gameNames, index, selections, awaiting, tempMin } = batch;
  const currentGameName = gameNames[index];

  const [prefix, name] = interaction.customId.split('_');
  const selectedValue = Number(interaction.values[0]);

  // 선택이 현재 진행 중인 게임과 불일치하면 무시
  if (name !== currentGameName) return;

  await interaction.deferUpdate(); // 로딩 방지

  // 최소 인원 선택 처리
  if (prefix === 'batchSelectMin') {
    pendingBatchMap.set(userId, {
      ...batch,
      awaiting: 'max',
      tempMin: selectedValue,
    });

    // 최대 인원 셀렉트 박스 전송
    const options = [];
    for (let i = selectedValue; i <= 10; i++) {
      options.push({
        label: `${i}명`,
        description: `${i}명의 플레이어`,
        value: `${i}`,
      });
    }

    const maxSelect = new StringSelectMenuBuilder()
      .setCustomId(`batchSelectMax_${currentGameName}`)
      .setPlaceholder(`[${currentGameName}] 최대 인원을 선택하세요`)
      .addOptions(options);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(maxSelect);

    await interaction.followUp({
      content: `🎮 [${currentGameName}]의 **최대 인원**을 선택해주세요.`,
      components: [row],
      ephemeral: true,
    });

    return;
  }

  // 최대 인원 선택 처리
  if (prefix === 'batchSelectMax') {
    if (typeof tempMin !== 'number') return;

    // 현재 게임 선택 완료
const newSelection: { name: string; min: number; max: number } = {
      name: currentGameName!,
      min: tempMin,
      max: selectedValue,
    };

    const nextIndex = index + 1;
    const isDone = nextIndex >= gameNames.length;

    if (isDone) {
      // 최종 등록
      for (const sel of [...selections, newSelection]) {
        gameList.push({
          name: sel.name!,
          minPlayers: sel.min,
          maxPlayers: sel.max,
          players: `${sel.min}~${sel.max}`,
        });
      }
    
        saveGameList(gameList);

      await interaction.followUp({
        content: `✅ ${gameNames.length}개의 게임이 등록되었습니다!`,
        ephemeral: true,
      });

      pendingBatchMap.delete(userId);
    } else {
      // 다음 게임으로 진행
      const nextGameName = gameNames[nextIndex];

      const options = [];
      for (let i = 2; i <= 10; i++) {
        options.push({
          label: `${i}명`,
          description: `${i}명의 플레이어`,
          value: `${i}`,
        });
      }

      const minSelect = new StringSelectMenuBuilder()
        .setCustomId(`batchSelectMin_${nextGameName}`)
        .setPlaceholder(`[${nextGameName}] 최소 인원을 선택하세요`)
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(minSelect);

      await interaction.followUp({
        content: `🎮 [${nextGameName}] 게임의 **최소 인원**을 선택해주세요.`,
        components: [row],
        ephemeral: true,
      });

      pendingBatchMap.set(userId, {
        gameNames,
        index: nextIndex,
        selections: [...selections, newSelection],
        awaiting: 'min',
      });
    }
  }
});



client.login(process.env.DISCORD_BOT_TOKEN);
