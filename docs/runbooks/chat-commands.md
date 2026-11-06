# Чат-команды Hearthpulse для стримеров / Chat commands for streamers

Контракт / contract: [chat commands](../specs/chat-commands.md).

## По-русски

1. В приложении Hearthpulse: Настройки → Стрим → Twitch — войдите и включите
   передачу колоды. Задержку выставьте как в OBS: `!deck` идёт с ней, другие
   команды учитывают игру через 10 минут после её конца. Защита от
   стрим-снайпинга — только эта задержка.
2. На hearthpulse.net в профиле привяжите Twitch и включите «Чат-команды»
   (раздел Twitch, по умолчанию выключено).
3. Для `!winrate`, `!rank`, `!mmr` включите в профиле показ статистики
   (страница `/id/<номер>/`). Без этого бот ответит «стример не показывает
   статистику». `!deck` работает и без этого.
4. Добавьте команды в чат-бота (канал подставится сам). Команды отвечают,
   только пока приложение передаёт колоду (вы в эфире с Hearthpulse).

**Nightbot** — в чате канала (или в панели Nightbot → Commands):

```text
!commands add !deck $(urlfetch https://hearthpulse.net/api/v1/chat/$(channel)/deck)
!commands add !winrate $(urlfetch https://hearthpulse.net/api/v1/chat/$(channel)/winrate)
!commands add !rank $(urlfetch https://hearthpulse.net/api/v1/chat/$(channel)/rank)
!commands add !mmr $(urlfetch https://hearthpulse.net/api/v1/chat/$(channel)/mmr)
```

**StreamElements** — в чате канала (или в панели → Chat commands → Custom):

```text
!cmd add !deck ${customapi.https://hearthpulse.net/api/v1/chat/${channel}/deck}
!cmd add !winrate ${customapi.https://hearthpulse.net/api/v1/chat/${channel}/winrate}
!cmd add !rank ${customapi.https://hearthpulse.net/api/v1/chat/${channel}/rank}
!cmd add !mmr ${customapi.https://hearthpulse.net/api/v1/chat/${channel}/mmr}
```

Проверка: откройте `https://hearthpulse.net/api/v1/chat/<ваш_логин>/deck` в
браузере. Пустая страница с ошибкой 404 — канал не привязан или чат-команды
выключены.

## In English

1. In the Hearthpulse app: Settings → Stream → Twitch — sign in and turn on
   sending your deck. Set the delay to your OBS delay: `!deck` follows it, the
   other commands count a game 10 minutes after it ends. That delay is the only
   protection against stream sniping.
2. On hearthpulse.net, link Twitch in your profile and switch «Chat commands»
   on (Twitch section, off by default).
3. For `!winrate`, `!rank`, `!mmr`, make your profile statistics public
   (`/id/<number>/`). Without it the bot answers that you do not share stats.
   `!deck` works either way.
4. Add the commands to your bot; `?lang=en` gives English answers. They
   answer only while the app is sending your deck (you are live with
   Hearthpulse).

**Nightbot:**

```text
!commands add !deck $(urlfetch https://hearthpulse.net/api/v1/chat/$(channel)/deck?lang=en)
!commands add !winrate $(urlfetch https://hearthpulse.net/api/v1/chat/$(channel)/winrate?lang=en)
!commands add !rank $(urlfetch https://hearthpulse.net/api/v1/chat/$(channel)/rank?lang=en)
!commands add !mmr $(urlfetch https://hearthpulse.net/api/v1/chat/$(channel)/mmr?lang=en)
```

**StreamElements:**

```text
!cmd add !deck ${customapi.https://hearthpulse.net/api/v1/chat/${channel}/deck?lang=en}
!cmd add !winrate ${customapi.https://hearthpulse.net/api/v1/chat/${channel}/winrate?lang=en}
!cmd add !rank ${customapi.https://hearthpulse.net/api/v1/chat/${channel}/rank?lang=en}
!cmd add !mmr ${customapi.https://hearthpulse.net/api/v1/chat/${channel}/mmr?lang=en}
```

Check: open `https://hearthpulse.net/api/v1/chat/<your_login>/deck`. An empty
404 means the channel is not linked or chat commands are off.
