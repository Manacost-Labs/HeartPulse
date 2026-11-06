# Чат-команды Hearthpulse для стримеров / Chat commands for streamers

Контракт / contract: [chat commands](../specs/chat-commands.md).

## По-русски

1. В приложении Hearthpulse: Настройки → Стрим → Twitch — войдите и включите
   передачу колоды. Задержку выставьте как в OBS: команды её соблюдают.
2. На hearthpulse.net в профиле привяжите Twitch (раздел Twitch).
3. Для `!winrate`, `!rank`, `!mmr` включите в профиле показ статистики
   (страница `/id/<номер>/`). Без этого бот ответит «стример не показывает
   статистику». `!deck` работает и без этого.
4. Добавьте команды в чат-бота (канал подставится сам).

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
браузере. Пустая страница с ошибкой 404 — канал не привязан к аккаунту сайта.

## In English

1. In the Hearthpulse app: Settings → Stream → Twitch — sign in and turn on
   sending your deck. Set the delay to your OBS delay: the commands respect it.
2. On hearthpulse.net, link Twitch in your profile (Twitch section).
3. For `!winrate`, `!rank`, `!mmr`, make your profile statistics public
   (`/id/<number>/`). Without it the bot answers that you do not share stats.
   `!deck` works either way.
4. Add the commands to your bot; `?lang=en` gives English answers.

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
404 means the channel is not linked to a site account.
