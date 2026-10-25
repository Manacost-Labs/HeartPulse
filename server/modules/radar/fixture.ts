/**
 * Демонстрационный радар для `RADAR_FIXTURE=1`: ответ hs-data-api
 * `/v1/constructed/balance-radar?format=standard` в его собственном формате
 * (docs/examples/balance-radar-standard.json репозитория hs-data-api от
 * 25.10.2026, посты урезаны до трёх, периоды — до основного ранга), плюс
 * одна вручную собранная запись архетипа: в примере архетипов нет.
 * Прецеденты — настоящие правки патча 36.4.2 из архива патчноутов сайта,
 * без чисел «до правки»: их в архиве нет. Сайт
 * отдаёт его с `demo: true`, и страница подписывает данные как демо.
 */
export const RADAR_FIXTURE: unknown = {
  "data": {
    "schemaVersion": 1,
    "runId": "20261025T101048Z-standard-ba1ec2",
    "format": "standard",
    "generatedAt": "2026-10-25T10:12:15+00:00",
    "summary": "Главная проблема текущего баланса — Чернокнижник. По окну после банов (black_empire_ban) класс показывает 61,25% винрейта при 27,2% доле игр. Zoolock держит 63,0% (58,8% на Легенде, 11,1% популярности), Shredslock 63,3% (58,3% на Легенде), C'Thun Warlock 60,5%. Сообщество массово требует нерфа, особенно «Ритуала призыва», а сила колод держится на нескольких конкретных картах, поэтому нерфы выбраны по картам, а не по архетипам.\n\nВторой источник давления — сам К'Тун. Он и Порождение К'Туна стоят почти в каждой четвёртой колоде на Легенде (25,4% и 24,4% за 7 дней, у К'Туна 37% за последние сутки) с винрейтом около 53,3%. На нём держатся C'Thun DH (59,3%, 14,1% на Легенде), C'Thun Warlock и Zee C'Thun Shaman (60,8%). Однако правило «новые карты не нерфят сразу» и недавний бан Квеста жреца снижают уверенность по новым картам расширения.\n\nБаффы — это Друид (46,3% винрейта у класса, 1,5% популярности), слабые новые карты Воина с винрейтом 36–39% и Агент Н'Зота с 30,7%. Маг выглядит слабым (49,1% по классу, 43,7–46,4% на Легенде у его архетипов), но сигнал по нему умеренный. Прошлого прогона для сравнения нет, поэтому устойчивость сигналов не оценивалась.",
    "nerfs": [
      {
        "ref": "card:BE_085",
        "kind": "card",
        "id": "BE_085",
        "dbfId": 129793,
        "name": "Ритуал призыва",
        "nameEn": "Ritual of Summoning",
        "class": "WARLOCK",
        "className": "Чернокнижник",
        "imageUrl": "https://art.hearthstonejson.com/v1/256x/BE_085.png",
        "cost": 2,
        "rarity": "COMMON",
        "set": "BE",
        "confidence": 75,
        "headline": "Ритуал призыва — самый частый и самый обсуждаемый элемент Zoolock",
        "verdict": "На Легенде у карты 55,9% винрейта при 18,8% популярности за 7 дней, а за последние сутки доля колод выросла до 27,2% (+8,35 п.п. к недельной). На Даймонде показатели ещё выше: 59,7% при 36,9% популярности. Карта питает Zoolock (63,0% по рангу all, 58,8% на Легенде) и остальные ритуальные колоды Чернокнижника. В сообществе прямо просят её нерфнуть, а раннее обсуждение показывает, что игроки считают её главным источником перекоса. Сдерживает только то, что это новая карта расширения.",
        "reasons": [
          "Винрейт на Легенде 55,9% и популярность 18,8–27,2%, на Даймонде 59,7% при 36,9%",
          "Zoolock — самый сильный популярный архетип: 63,0% по рангу all, 58,8% на Легенде",
          "Два тела 3/5 с Провокацией за 2 маны слишком эффективны, их усиливают баффами",
          "Игроки массово жалуются на Чернокнижников в каждой игре"
        ],
        "suggestedChange": "Стоимость 2 → 3 или статы призываемых существ 3/5 → 3/4",
        "stats": {
          "source": "hsreplay",
          "rank": "legend",
          "period": "7d",
          "winrate": 55.9,
          "popularity": 18.82,
          "playedWinrate": 55.55,
          "drawnWinrate": 55.24,
          "timesPlayed": 64641,
          "keepPercentage": 96.64,
          "trend": {
            "popularityDelta": 8.35,
            "playedWinrateDelta": -0.02,
            "basis": "popularity 1d − 7d, played winrate 3d − 14d, rank legend"
          },
          "periods": [
            {
              "rank": "legend",
              "period": "1d",
              "deckWinrate": 56.47,
              "deckPopularity": 27.17,
              "playedWinrate": 56.07,
              "drawnWinrate": 55.82,
              "timesPlayed": 33442,
              "keepPercentage": 97.8
            },
            {
              "rank": "legend",
              "period": "3d",
              "deckWinrate": 55.85,
              "deckPopularity": 25.67,
              "playedWinrate": 55.45,
              "drawnWinrate": 55.15,
              "timesPlayed": 61686,
              "keepPercentage": 96.71
            },
            {
              "rank": "legend",
              "period": "7d",
              "deckWinrate": 55.9,
              "deckPopularity": 18.82,
              "playedWinrate": 55.55,
              "drawnWinrate": 55.24,
              "timesPlayed": 64641,
              "keepPercentage": 96.64
            },
            {
              "rank": "legend",
              "period": "14d",
              "deckWinrate": 55.92,
              "deckPopularity": 13.81,
              "playedWinrate": 55.47,
              "drawnWinrate": 55.2,
              "timesPlayed": 69899,
              "keepPercentage": 96.72
            },
            {
              "rank": "legend",
              "period": "patch",
              "deckWinrate": 55.82,
              "deckPopularity": 25.86,
              "playedWinrate": 55.29,
              "drawnWinrate": 55.04,
              "timesPlayed": 70877,
              "keepPercentage": 96.85
            }
          ]
        },
        "social": {
          "mentions": {
            "total": 7,
            "reddit": 6,
            "x": 1
          },
          "sentiment": "negative",
          "stance": "wants_nerf",
          "summary": "Популярный тред «Nerf Ritual of Summoning» набрал 352 очка и 253 комментария. Игроки жалуются, что на Чернокнижников нельзя играть мем-колоды. Один пользователь согласен, что карта слишком сильна, но не считает перегибом соседний Ритуал завоевания.",
          "topPosts": [
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xdju41",
              "url": "https://reddit.com/r/hearthstone/comments/1xdju41/nerf_ritual_of_summoning/",
              "author": "Sea_Particular_244",
              "score": 352,
              "comments": 253,
              "title": "Nerf Ritual of Summoning.",
              "excerpt": "They are not insta-nerfing Rituals because they're part of the new expansion, which is a ridiculous rule. Let go of it, Blizzard, and give the people what they want!",
              "community": "r/hearthstone",
              "createdAt": "2026-10-23T17:06:53.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xchavf",
              "url": "https://reddit.com/r/hearthstone/comments/1xchavf/i_think_blizzard_missed_some_text_off_ritual_of/",
              "author": "Numerous-Inside-6068",
              "score": 215,
              "comments": 55,
              "title": "I think Blizzard missed some text off Ritual of Summoning",
              "excerpt": "I'm not salty... I just want to play meme decks and it not be another warlock whose gonna kick the shit out of me",
              "community": "r/hearthstone",
              "createdAt": "2026-10-22T12:32:50.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "comment",
              "id": "reddit-comment:19rjlz3otgrb7",
              "url": "https://www.reddit.com/r/hearthstone/comments/1xdju41/nerf_ritual_of_summoning/19rjlz3otgrb7/",
              "author": "freshjori",
              "score": 26,
              "comments": null,
              "title": null,
              "excerpt": "While I agree that Ritual of Summoning is too strong, I strongly disagree that Ritual of Conquest needs a nerf. In most of my games, it's really difficult to get Kith'ix out because I'm just dead if I try. 6 mana 6/6 do nothing (for 2 turns).",
              "community": "r/hearthstone",
              "createdAt": "2026-10-23T17:56:23+00:00",
              "official": false,
              "citedByModel": true
            }
          ]
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": 68,
          "statsFetchedAt": "2026-10-25T06:01:39.545307+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        },
        "precedents": [
          {
            "patch": "36.4.2",
            "date": "2026-09-04T00:48:51+00:00",
            "setAgeDays": null,
            "preStats": null,
            "postStats": null,
            "url": null,
            "summary": null,
            "id": "36.4.2:JAIL_202",
            "cardId": "JAIL_202",
            "dbfId": null,
            "name": "Паучок",
            "nameEn": null,
            "class": "DRUID",
            "direction": "nerf",
            "changes": [
              {
                "field": "health",
                "before": 3,
                "after": 2
              }
            ],
            "similarity": [
              "cited"
            ],
            "citedByModel": true
          }
        ]
      },
      {
        "ref": "card:BE_726",
        "kind": "card",
        "id": "BE_726",
        "dbfId": 130281,
        "name": "Ритуал К'Туна",
        "nameEn": "Ritual of C'Thun",
        "class": "WARLOCK",
        "className": "Чернокнижник",
        "imageUrl": "https://art.hearthstonejson.com/v1/256x/BE_726.png",
        "cost": 1,
        "rarity": "RARE",
        "set": "BE",
        "confidence": 62,
        "headline": "Ритуал К'Туна даёт Чернокнижнику бесплатный темп и открытие способностей К'Туна",
        "verdict": "За 7 дней на Легенде карта показывает 55,8% винрейта при 19,1% популярности. За сутки популярность выросла до 27,3% (+8,2 п.п.), а на Даймонде она составляет 37,3% при 59,6%. Карта за 1 ману запускает способности К'Туна и стоит в связке с Ритуалом призыва (ход 1 — Ритуал К'Туна, ход 2 — Ритуал призыва). На ней держатся C'Thun Warlock (60,5%) и Zoolock. Это самая дешёвая из ключевых деталей, но прямых упоминаний в соцсетях немного.",
        "reasons": [
          "Винрейт 55,8% на Легенде и 59,6% на Даймонде при 19–27% популярности",
          "Дешёвая связка с Ритуалом призыва и Казакусом, на которую жалуются игроки",
          "На ней строится C'Thun Warlock с 60,5% по рангу all"
        ],
        "suggestedChange": "Стоимость 1 → 2",
        "stats": {
          "source": "hsreplay",
          "rank": "legend",
          "period": "7d",
          "winrate": 55.8,
          "popularity": 19.1,
          "playedWinrate": 55.77,
          "drawnWinrate": 55.57,
          "timesPlayed": 71613,
          "keepPercentage": 97.73,
          "trend": {
            "popularityDelta": 8.22,
            "playedWinrateDelta": -0.07,
            "basis": "popularity 1d − 7d, played winrate 3d − 14d, rank legend"
          },
          "periods": [
            {
              "rank": "legend",
              "period": "1d",
              "deckWinrate": 56.4,
              "deckPopularity": 27.32,
              "playedWinrate": 56.17,
              "drawnWinrate": 56.01,
              "timesPlayed": 36086,
              "keepPercentage": 98.22
            },
            {
              "rank": "legend",
              "period": "3d",
              "deckWinrate": 55.74,
              "deckPopularity": 26.01,
              "playedWinrate": 55.63,
              "drawnWinrate": 55.43,
              "timesPlayed": 68068,
              "keepPercentage": 97.86
            },
            {
              "rank": "legend",
              "period": "7d",
              "deckWinrate": 55.8,
              "deckPopularity": 19.1,
              "playedWinrate": 55.77,
              "drawnWinrate": 55.57,
              "timesPlayed": 71613,
              "keepPercentage": 97.73
            },
            {
              "rank": "legend",
              "period": "14d",
              "deckWinrate": 55.82,
              "deckPopularity": 14.0,
              "playedWinrate": 55.7,
              "drawnWinrate": 55.53,
              "timesPlayed": 77219,
              "keepPercentage": 97.84
            },
            {
              "rank": "legend",
              "period": "patch",
              "deckWinrate": 55.72,
              "deckPopularity": 26.16,
              "playedWinrate": 55.56,
              "drawnWinrate": 55.41,
              "timesPlayed": 77993,
              "keepPercentage": 98.01
            }
          ]
        },
        "social": {
          "mentions": {
            "total": 2,
            "reddit": 2,
            "x": 0
          },
          "sentiment": "negative",
          "stance": "wants_nerf",
          "summary": "Упоминается в жалобах на комбинацию «ход 1 Ритуал К'Туна, ход 2 Ритуал призыва, ход 3 Казакус», все партии с которой оказываются против Чернокнижника. Отдельных разборов самой карты мало.",
          "topPosts": [
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xef29x",
              "url": "https://reddit.com/r/hearthstone/comments/1xef29x/t1_cthun_ritual_t2_summoning_ritual_t3_kazakus/",
              "author": "isthisathrowawayas",
              "score": 67,
              "comments": 33,
              "title": "T1 C'thun ritual T2 Summoning ritual T3 Kazakus",
              "excerpt": "I mean nothing we don't know but I seriously hope this is getting a hotfix nerf next week because it's been 4 days since xpac release and it's unbearably boring to play against this garbage every game. Out of 6 games played while walking my dog 5 were Warlocks.",
              "community": "r/hearthstone",
              "createdAt": "2026-10-24T17:49:55.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xdt6hn",
              "url": "https://reddit.com/r/hearthstone/comments/1xdt6hn/warlock_cards_are_so_good_and_effective_it/",
              "author": "w2001420",
              "score": 224,
              "comments": 75,
              "title": "Warlock cards are so good and effective it genuinely feels like im playing against a solo adventure boss",
              "excerpt": "https://preview.redd.it/zu9ulrfjhaxh1.png?width=1597&format=png&auto=webp&s=bb142d12d6f7f625fd00a18f9b153c8821b6ee5d  Played vs warlock every game before the expansion, then priest was good for 24 hours. And now back to playing vs warlock every game again. Dont get me wrong im gl…",
              "community": "r/hearthstone",
              "createdAt": "2026-10-23T23:19:56.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "comment",
              "id": "reddit-comment:phzu47y",
              "url": "https://www.reddit.com/r/hearthstone/comments/1xb99wg/priest_feeling_like_a_meta_tyrant_right_now/phzu47y/",
              "author": "PipAntarctic",
              "score": 5,
              "comments": null,
              "title": null,
              "excerpt": "It's easily the quest being too fast to complete with Elder Word: Flay and Entropic Rift shoring up what used to be a big limiter for the deck (casting Shadow spells). The most popular lists right now don't even run any Imbue cards.  It is early (not even a day) and the data is s…",
              "community": "r/hearthstone",
              "createdAt": "2026-10-21T09:25:08+00:00",
              "official": false,
              "citedByModel": false
            }
          ]
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": null,
          "statsFetchedAt": "2026-10-25T06:01:39.545307+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        }
      },
      {
        "ref": "card:BE_013",
        "kind": "card",
        "id": "BE_013",
        "dbfId": 132339,
        "name": "К'Тун, Око Империи",
        "nameEn": "C'Thun, Eye of the Empire",
        "class": "NEUTRAL",
        "className": "Нейтральная",
        "imageUrl": "https://art.hearthstonejson.com/v1/256x/BE_013.png",
        "cost": 10,
        "rarity": "LEGENDARY",
        "set": "BE",
        "confidence": 58,
        "headline": "К'Тун, Око Империи — ключевая карта доминирующих C'Thun-колод",
        "verdict": "К'Тун стоит в 25,4% колод на Легенде за 7 дней (37,4% за сутки) при винрейте 53,3%, на Даймонде 57,6%. Играют его C'Thun DH (59,3% по рангу all, 14,1% на Легенде), C'Thun Warlock (60,5%) и Zee C'Thun Shaman (60,8%). Популярность растёт на +12 п.п. за сутки, то есть он становится ядром меты. Фанатские аналитики прямо пишут о «серьёзных нерфах», а обсуждаются и ограничения на копирование К'Туна. Риск — Blizzard вряд ли станет сразу нерфить новую легендарную карту.",
        "reasons": [
          "Популярность 25,4% за 7 дней и 37,4% за сутки на Легенде, винрейт 53,3%",
          "На нём построены сразу три колоды с винрейтом 59–61% по рангу all",
          "Аналитики и игроки обсуждают «серьёзные нерфы» и запрет копирования",
          "Спутники — Порождение К'Туна (24,4%) и Громадный Скользящий (18,1%)"
        ],
        "suggestedChange": "Стоимость 10 → 12 или запрет копирования К'Туна другими эффектами",
        "stats": {
          "source": "hsreplay",
          "rank": "legend",
          "period": "7d",
          "winrate": 53.3,
          "popularity": 25.37,
          "playedWinrate": 68.33,
          "drawnWinrate": 53.47,
          "timesPlayed": 50930,
          "keepPercentage": 3.37,
          "trend": {
            "popularityDelta": 12.07,
            "playedWinrateDelta": 0.15,
            "basis": "popularity 1d − 7d, played winrate 3d − 14d, rank legend"
          },
          "periods": [
            {
              "rank": "legend",
              "period": "1d",
              "deckWinrate": 53.16,
              "deckPopularity": 37.44,
              "playedWinrate": 67.49,
              "drawnWinrate": 53.33,
              "timesPlayed": 27521,
              "keepPercentage": 2.7
            },
            {
              "rank": "legend",
              "period": "3d",
              "deckWinrate": 53.24,
              "deckPopularity": 34.4,
              "playedWinrate": 68.21,
              "drawnWinrate": 53.31,
              "timesPlayed": 48227,
              "keepPercentage": 3.36
            },
            {
              "rank": "legend",
              "period": "7d",
              "deckWinrate": 53.3,
              "deckPopularity": 25.37,
              "playedWinrate": 68.33,
              "drawnWinrate": 53.47,
              "timesPlayed": 50930,
              "keepPercentage": 3.37
            },
            {
              "rank": "legend",
              "period": "14d",
              "deckWinrate": 53.17,
              "deckPopularity": 18.57,
              "playedWinrate": 68.06,
              "drawnWinrate": 53.3,
              "timesPlayed": 54973,
              "keepPercentage": 3.26
            },
            {
              "rank": "legend",
              "period": "patch",
              "deckWinrate": 53.06,
              "deckPopularity": 34.42,
              "playedWinrate": 67.91,
              "drawnWinrate": 53.13,
              "timesPlayed": 55220,
              "keepPercentage": 3.28
            }
          ]
        },
        "social": {
          "mentions": {
            "total": 6,
            "reddit": 6,
            "x": 0
          },
          "sentiment": "mixed",
          "stance": "wants_nerf",
          "summary": "Популярный аналитик пишет, что К'Тун «возвышается над Hearthstone» и ему могут понадобиться серьёзные нерфы. В комментариях предполагают, что Blizzard запретит копировать К'Туна. Часть игроков, наоборот, делится успешными колодами с ним.",
          "topPosts": [
            {
              "platform": "x",
              "kind": "tweet",
              "id": "x:2114098274814796066",
              "url": "https://x.com/ClarkHELLSCREAM/status/2114098274814796066",
              "author": "ClarkHELLSCREAM",
              "score": 78,
              "comments": 21,
              "title": null,
              "excerpt": "The current ranking of the Black Empire Legendary Cards.  C'thun is towering over Hearthstone, may need major nerfs.  S - Best Card (excluding C'thun) A - Enables top tier decks B - Powerhouse for Tier 2/3 C - Niche  D - Struggles to Win Games F - Desperately needs buffs/support …",
              "community": "x",
              "createdAt": "2026-10-24T20:54:41+00:00",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "comment",
              "id": "reddit-comment:19rggw17rjb28",
              "url": "https://www.reddit.com/r/hearthstone/comments/1xc2n4e/hotfix_banned_cards_for_now/19rggw17rjb28/",
              "author": "libero0602",
              "score": 63,
              "comments": null,
              "title": null,
              "excerpt": "Cthunlock slightly held back now as well, with Divergence and Bat Mask banned. The divergence/mother/bat mask version of the deck was quickly rising to be the strongest performer of all the variations  I think they may change Cthun so that he cannot be copied by any effects, in a…",
              "community": "r/hearthstone",
              "createdAt": "2026-10-21T23:41:00+00:00",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xcnxwi",
              "url": "https://reddit.com/r/hearthstone/comments/1xcnxwi/ive_never_had_this_many_friends_requests_before/",
              "author": "IUseChatGPT",
              "score": 328,
              "comments": 51,
              "title": "I've never had this many friends requests before playing this deck",
              "excerpt": "I just reached legend with the deck below after being stuck on Diamond 5 since the beginning of this month. The most fun thing I like about it is that it is played differently depending on the matchup. If you play against a control deck that clears your board consistently (like b…",
              "community": "r/hearthstone",
              "createdAt": "2026-10-22T16:50:41.000Z",
              "official": false,
              "citedByModel": true
            }
          ]
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": null,
          "statsFetchedAt": "2026-10-25T06:01:39.545307+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        },
        "precedents": [
          {
            "patch": "36.4.2",
            "date": "2026-09-04T00:48:51+00:00",
            "setAgeDays": null,
            "preStats": null,
            "postStats": null,
            "url": null,
            "summary": null,
            "id": "36.4.2:TLC_460",
            "cardId": "TLC_460",
            "dbfId": null,
            "name": "Запретный протокол",
            "nameEn": null,
            "class": "MAGE",
            "direction": "nerf",
            "changes": [],
            "similarity": [],
            "citedByModel": false,
            "textBefore": "Задача: раскопайте 7 карт. Награда: «Камень истока».",
            "textAfter": "Задача: раскопайте 8 карт. Награда: «Камень истока»."
          }
        ]
      },
      {
        "ref": "archetype:standard:Zoolock",
        "kind": "archetype",
        "id": "Zoolock",
        "dbfId": null,
        "name": "Zoolock",
        "nameEn": "Zoolock",
        "class": "WARLOCK",
        "className": "Чернокнижник",
        "imageUrl": null,
        "confidence": 55,
        "headline": "Зоолок — сильнейший популярный архетип после банов",
        "verdict": "Демонстрационная запись архетипа: в примере hs-data-api архетипов нет, поэтому эта карточка собрана вручную из чисел HSGuru. Зоолок держит 63,0% винрейта при 11,1% популярности, на Легенде 58,8%. Нерф скорее придёт через ключевые карты колоды, чем через архетип целиком.",
        "reasons": [
          "63,0% винрейта по всем рангам при 11,1% популярности",
          "На Легенде 58,8% — выше любого другого популярного архетипа"
        ],
        "suggestedChange": "Ослабление Ритуала призыва снизит силу архетипа без отдельного изменения",
        "stats": {
          "source": "hsguru",
          "rank": "all",
          "period": "black_empire_ban",
          "winrate": 63.0,
          "popularity": 11.1,
          "games": 48210,
          "legendWinrate": 58.8,
          "trend": null,
          "periods": [
            {
              "rank": "all",
              "period": "past_day",
              "winrate": 62.1,
              "popularity": 12.4,
              "games": 9120
            },
            {
              "rank": "all",
              "period": "past_3_days",
              "winrate": 62.7,
              "popularity": 11.9,
              "games": 25400
            },
            {
              "rank": "all",
              "period": "past_week",
              "winrate": 63.2,
              "popularity": 10.8,
              "games": 51200
            },
            {
              "rank": "all",
              "period": "black_empire",
              "winrate": 61.9,
              "popularity": 9.7,
              "games": 88300
            },
            {
              "rank": "all",
              "period": "black_empire_ban",
              "winrate": 63.0,
              "popularity": 11.1,
              "games": 48210
            }
          ]
        },
        "social": {
          "mentions": {
            "total": 3,
            "reddit": 3,
            "x": 0
          },
          "sentiment": "negative",
          "stance": "wants_nerf",
          "summary": "Зоолок упоминают вместе с Ритуалом призыва: игроки жалуются на Чернокнижника в каждой игре.",
          "topPosts": []
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": null,
          "statsFetchedAt": "2026-10-24T22:00:03.510913+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        }
      },
      {
        "ref": "card:CAP_405",
        "kind": "card",
        "id": "CAP_405",
        "dbfId": 127067,
        "name": "Крестный отец Казакус",
        "nameEn": "Godfather Kazakus",
        "class": "WARLOCK",
        "className": "Чернокнижник",
        "imageUrl": "https://art.hearthstonejson.com/v1/256x/CAP_405.png",
        "cost": 3,
        "rarity": "LEGENDARY",
        "set": "ESCAPEFROM_VIOLET_HOLD",
        "confidence": 52,
        "headline": "Крестный отец Казакус — старая карта, лишающая оппонента условия победы",
        "verdict": "Карта показывает 55,1% винрейта на Легенде при 21,4% популярности за 7 дней, а за сутки доля выросла до 27,3% (56,4%). На Даймонде 58,3–59,6%, винрейт при розыгрыше 57,5%. Она стоит не в новом наборе, а значит, Blizzard легче нерфнуть её без нарушения «правила новых карт». Игроки жалуются, что Казакус крадёт условия победы контрольных колод и работает с Zoolock и C'Thun Warlock.",
        "reasons": [
          "55,1% на Легенде при 21,4% популярности, 27,3% за сутки",
          "Карта не из нового расширения, поэтому её нерфнуть проще",
          "Игроки жалуются на кражу вин-кондишена и на комбинацию 1–2–3"
        ],
        "suggestedChange": "Стоимость 3 → 4",
        "stats": {
          "source": "hsreplay",
          "rank": "legend",
          "period": "7d",
          "winrate": 55.08,
          "popularity": 21.43,
          "playedWinrate": 57.47,
          "drawnWinrate": 56.52,
          "timesPlayed": 40112,
          "keepPercentage": 89.1,
          "trend": {
            "popularityDelta": 5.87,
            "playedWinrateDelta": 0.32,
            "basis": "popularity 1d − 7d, played winrate 3d − 14d, rank legend"
          },
          "periods": [
            {
              "rank": "legend",
              "period": "1d",
              "deckWinrate": 56.39,
              "deckPopularity": 27.3,
              "playedWinrate": 58.27,
              "drawnWinrate": 57.56,
              "timesPlayed": 18278,
              "keepPercentage": 89.22
            },
            {
              "rank": "legend",
              "period": "3d",
              "deckWinrate": 55.68,
              "deckPopularity": 26.01,
              "playedWinrate": 57.53,
              "drawnWinrate": 56.86,
              "timesPlayed": 34109,
              "keepPercentage": 88.18
            },
            {
              "rank": "legend",
              "period": "7d",
              "deckWinrate": 55.08,
              "deckPopularity": 21.43,
              "playedWinrate": 57.47,
              "drawnWinrate": 56.52,
              "timesPlayed": 40112,
              "keepPercentage": 89.1
            },
            {
              "rank": "legend",
              "period": "14d",
              "deckWinrate": 54.26,
              "deckPopularity": 18.38,
              "playedWinrate": 57.21,
              "drawnWinrate": 56.03,
              "timesPlayed": 50716,
              "keepPercentage": 90.34
            },
            {
              "rank": "legend",
              "period": "patch",
              "deckWinrate": 55.68,
              "deckPopularity": 26.15,
              "playedWinrate": 57.61,
              "drawnWinrate": 56.93,
              "timesPlayed": 39178,
              "keepPercentage": 88.73
            }
          ]
        },
        "social": {
          "mentions": {
            "total": 1,
            "reddit": 0,
            "x": 1
          },
          "sentiment": "negative",
          "stance": "wants_nerf",
          "summary": "Упоминают в жалобах на открытие «Ритуал К'Туна → Ритуал призыва → Казакус» и на то, что контрольный Чернокнижник крадёт все вин-кондишены Старых богов.",
          "topPosts": [
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xef29x",
              "url": "https://reddit.com/r/hearthstone/comments/1xef29x/t1_cthun_ritual_t2_summoning_ritual_t3_kazakus/",
              "author": "isthisathrowawayas",
              "score": 67,
              "comments": 33,
              "title": "T1 C'thun ritual T2 Summoning ritual T3 Kazakus",
              "excerpt": "I mean nothing we don't know but I seriously hope this is getting a hotfix nerf next week because it's been 4 days since xpac release and it's unbearably boring to play against this garbage every game. Out of 6 games played while walking my dog 5 were Warlocks.",
              "community": "r/hearthstone",
              "createdAt": "2026-10-24T17:49:55.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "x",
              "kind": "tweet",
              "id": "x:2113538124886544712",
              "url": "https://x.com/youceegaming/status/2113538124886544712",
              "author": "youceegaming",
              "score": 11,
              "comments": 2,
              "title": null,
              "excerpt": "Back in my day, the Zoolock deck did not have the following:  → Two Sen'jin Shieldmasta for JUST two mana (Ritual of Summoning) → Steal the opponent's WIN condition (Kazakus) → MANA cheat minions and disrupt your opponent (Zakajz the Corruptor) → 4-damage board clear that can go …",
              "community": "x",
              "createdAt": "2026-10-23T07:48:51+00:00",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xcptwg",
              "url": "https://reddit.com/r/hearthstone/comments/1xcptwg/what_are_the_best_decks_for_countering_control/",
              "author": "Financial_East8287",
              "score": 12,
              "comments": 53,
              "title": "What are the best decks for countering control warlock.",
              "excerpt": "Warlock is way too consistent and they are obviously going to be the power outlier once priest gets nerfed into oblivion (hopefully). Great vs control stealing all old god wincons and great into midrange/aggro getting to clear the board for 7-8 mana and getting 24/24 worth of lif…",
              "community": "r/hearthstone",
              "createdAt": "2026-10-22T17:59:30.000Z",
              "official": false,
              "citedByModel": true
            }
          ]
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": null,
          "statsFetchedAt": "2026-10-25T06:01:39.545307+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        }
      },
      {
        "ref": "card:TIME_029",
        "kind": "card",
        "id": "TIME_029",
        "dbfId": 120488,
        "name": "Губительный велоцидракон",
        "nameEn": "Ruinous Velocidrake",
        "class": "WARLOCK",
        "className": "Чернокнижник",
        "imageUrl": "https://art.hearthstonejson.com/v1/256x/TIME_029.png",
        "cost": 5,
        "rarity": "COMMON",
        "set": "TIME_TRAVEL",
        "confidence": 38,
        "headline": "Губительный велоцидракон — ядро Shredslock с растущей популярностью",
        "verdict": "На Легенде у карты 57,9% винрейта (61,1% на Даймонде), популярность выросла с 8,3% за 7 дней до 15,4% за сутки. Shredslock, использующий её, показывает 63,3% по рангу all и 58,3% на Легенде, а его популярность растёт (9,8% за сутки против 4,3% за неделю). Прямых упоминаний в соцсетях нет, поэтому уверенность умеренная.",
        "reasons": [
          "57,9% на Легенде и 61,1% на Даймонде — один из лучших винрейтов среди массовых карт",
          "Популярность почти удвоилась за сутки на Легенде (8,3% → 15,4%)",
          "Shredslock — 63,3% по рангу all, 58,3% на Легенде"
        ],
        "suggestedChange": "Стоимость 5 → 6",
        "stats": {
          "source": "hsreplay",
          "rank": "legend",
          "period": "7d",
          "winrate": 57.89,
          "popularity": 8.34,
          "playedWinrate": 50.58,
          "drawnWinrate": 53.15,
          "timesPlayed": 19473,
          "keepPercentage": 4.96,
          "trend": {
            "popularityDelta": 7.05,
            "playedWinrateDelta": 0.14,
            "basis": "popularity 1d − 7d, played winrate 3d − 14d, rank legend"
          },
          "periods": [
            {
              "rank": "legend",
              "period": "1d",
              "deckWinrate": 57.7,
              "deckPopularity": 15.39,
              "playedWinrate": 51.16,
              "drawnWinrate": 53.44,
              "timesPlayed": 13019,
              "keepPercentage": 4.62
            },
            {
              "rank": "legend",
              "period": "3d",
              "deckWinrate": 57.96,
              "deckPopularity": 11.83,
              "playedWinrate": 50.66,
              "drawnWinrate": 53.25,
              "timesPlayed": 19340,
              "keepPercentage": 4.96
            },
            {
              "rank": "legend",
              "period": "7d",
              "deckWinrate": 57.89,
              "deckPopularity": 8.34,
              "playedWinrate": 50.58,
              "drawnWinrate": 53.15,
              "timesPlayed": 19473,
              "keepPercentage": 4.96
            },
            {
              "rank": "legend",
              "period": "14d",
              "deckWinrate": 57.75,
              "deckPopularity": 6.33,
              "playedWinrate": 50.52,
              "drawnWinrate": 53.04,
              "timesPlayed": 21892,
              "keepPercentage": 4.96
            },
            {
              "rank": "legend",
              "period": "patch",
              "deckWinrate": 57.74,
              "deckPopularity": 12.38,
              "playedWinrate": 50.51,
              "drawnWinrate": 53.01,
              "timesPlayed": 23274,
              "keepPercentage": 5.0
            }
          ]
        },
        "social": {
          "mentions": {
            "total": 0,
            "reddit": 0,
            "x": 0
          },
          "sentiment": "no_data",
          "stance": "no_data",
          "summary": "",
          "topPosts": []
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": null,
          "statsFetchedAt": "2026-10-25T06:01:39.545307+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        }
      }
    ],
    "buffs": [
      {
        "ref": "class:standard:DRUID",
        "kind": "class",
        "id": "DRUID",
        "dbfId": null,
        "name": "Друид",
        "nameEn": "Druid",
        "class": "DRUID",
        "className": "Друид",
        "imageUrl": null,
        "cost": null,
        "rarity": null,
        "set": null,
        "confidence": 48,
        "headline": "Друид провалился после выхода дополнения",
        "verdict": "Винрейт класса составляет 46,28% при 1,5% доли игр. Ammunae N'Zoth Druid показывает 44,5% (38,3% на Легенде), Beast Druid — 44,4% (38,8% на Легенде). Новые карты тоже слабы: Расцветание — 34,7%, Цветок смерти — 37,9% на Легенде. В сообществе открыто обсуждают, что «Друид провалился». Одновременно один автор защищает Ammunae, поэтому сигнал неоднозначный.",
        "reasons": [
          "Винрейт класса 46,28% при 1,5% популярности — значительно ниже порога 47–48%",
          "Все архетипы Друида на Легенде ниже 39%",
          "Новые карты Друида имеют винрейт 34–38% на Легенде",
          "Игроки обсуждают падение Друида"
        ],
        "suggestedChange": "Точечные баффы новых карт Друида, например Расцветание: стоимость 2 → 1",
        "stats": {
          "source": "hsguru",
          "rank": "all",
          "period": "black_empire_ban",
          "winrate": 46.28,
          "popularity": 1.5,
          "games": 20104,
          "topArchetypes": [
            "Ammunae N'Zoth Druid",
            "Beast Druid",
            "Attack Druid",
            "C'Thun Druid"
          ],
          "trend": null,
          "periods": []
        },
        "social": {
          "mentions": {
            "total": 24,
            "reddit": 24,
            "x": 0
          },
          "sentiment": "mixed",
          "stance": "wants_buff",
          "summary": "Тред «Druid fell off so fast» собрал 132 очка и 69 комментариев с жалобами на винрейт. Автор другого поста защищает Ammunae N'Zoth Druid, а в комментариях отмечают, что Beast Druid страдает от случайности Сборки.",
          "topPosts": [
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xecmjt",
              "url": "https://reddit.com/r/hearthstone/comments/1xecmjt/is_it_just_because_meta_is_not_formed_yet_or_new/",
              "author": "Mister_plant9",
              "score": 132,
              "comments": 69,
              "title": "Is it just because meta is not formed yet or new druid cards are that bad?",
              "excerpt": "Druid fell off so fast with a new expansion , I kinda get why but this winrate… yikes",
              "community": "r/hearthstone",
              "createdAt": "2026-10-24T16:11:43.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xcwe63",
              "url": "https://reddit.com/r/hearthstone/comments/1xcwe63/ammunemenueme_is_way_better_then_people_think/",
              "author": "Comfortable_Luck9582",
              "score": 108,
              "comments": 51,
              "title": "Ammunemenueme is way better then people think",
              "excerpt": "This deck feals amazing this because of how druid works, mainly by how good Waveshaping for tutoring it out and ramp, and the fact that you can fill your hand with N'zoth (at most 6) with two gemstone hoarder  Its like merithra druid if it had ton of healing and armor and highrol…",
              "community": "r/hearthstone",
              "createdAt": "2026-10-22T22:09:58.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "comment",
              "id": "reddit-comment:19rlzaczyisis",
              "url": "https://www.reddit.com/r/hearthstone/comments/1xeplz2/every_bad_8_cost_they_release_nerfs_like_10_other/19rlzaczyisis/",
              "author": "SuperPalpitation695",
              "score": 68,
              "comments": null,
              "title": null,
              "excerpt": "Low rolls are important to gate randomness from ever being well, too consistant. Evolve shaman had a few cases in standard way back when where you could hedge your creatures into some really good cards.  Im okay with low rolls, but let there be some highrolls too yknow? While by …",
              "community": "r/hearthstone",
              "createdAt": "2026-10-25T01:49:06+00:00",
              "official": false,
              "citedByModel": true
            }
          ]
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": null,
          "statsFetchedAt": "2026-10-24T22:00:03.510913+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        }
      },
      {
        "ref": "card:BE_600",
        "kind": "card",
        "id": "BE_600",
        "dbfId": 130279,
        "name": "Оживитель железа",
        "nameEn": "Animator of Iron",
        "class": "WARRIOR",
        "className": "Воин",
        "imageUrl": "https://art.hearthstonejson.com/v1/256x/BE_600.png",
        "cost": 3,
        "rarity": "EPIC",
        "set": "BE",
        "confidence": 42,
        "headline": "Оживитель железа — ядро брони Воина с катастрофическим винрейтом",
        "verdict": "У карты 36,05% на Легенде при 1,14% популярности за 7 дней, на Даймонде 39,8%. Остальной пакет брони Воина (Авангард тол'виров 36,6%, Каменная рукавица 39,4%, Горн созидания 39,0%) выглядит так же. Armor Warrior в статистике показывает 44,3% по рангу all и 40,4% на Легенде. При этом отдельные игроки находят агрессивные сборки (58% и выход в Легенду), так что точечный бафф ядра пакета выглядит оправданным.",
        "reasons": [
          "36,05% на Легенде — одна из самых слабых популярных новых карт",
          "Весь пакет брони Воина показывает 36–39% на Легенде",
          "Armor Warrior: 44,3% по рангу all, 40,4% на Легенде",
          "Игроки пробуют агрессивные сборки и частично выигрывают"
        ],
        "suggestedChange": "Стоимость 3 → 2 или «после получения брони берите карту, дважды за ход»",
        "stats": {
          "source": "hsreplay",
          "rank": "legend",
          "period": "7d",
          "winrate": 36.05,
          "popularity": 1.14,
          "playedWinrate": 38.98,
          "drawnWinrate": 38.36,
          "timesPlayed": 3481,
          "keepPercentage": 66.22,
          "trend": {
            "popularityDelta": 0.35,
            "playedWinrateDelta": 0.07,
            "basis": "popularity 1d − 7d, played winrate 3d − 14d, rank legend"
          },
          "periods": [
            {
              "rank": "legend",
              "period": "1d",
              "deckWinrate": 39.38,
              "deckPopularity": 1.49,
              "playedWinrate": 42.49,
              "drawnWinrate": 41.99,
              "timesPlayed": 1598,
              "keepPercentage": 63.47
            },
            {
              "rank": "legend",
              "period": "3d",
              "deckWinrate": 36.51,
              "deckPopularity": 1.46,
              "playedWinrate": 39.64,
              "drawnWinrate": 38.7,
              "timesPlayed": 3082,
              "keepPercentage": 66.01
            },
            {
              "rank": "legend",
              "period": "7d",
              "deckWinrate": 36.05,
              "deckPopularity": 1.14,
              "playedWinrate": 38.98,
              "drawnWinrate": 38.36,
              "timesPlayed": 3481,
              "keepPercentage": 66.22
            },
            {
              "rank": "legend",
              "period": "14d",
              "deckWinrate": 36.7,
              "deckPopularity": 0.83,
              "playedWinrate": 39.57,
              "drawnWinrate": 39.06,
              "timesPlayed": 3725,
              "keepPercentage": 66.66
            },
            {
              "rank": "legend",
              "period": "patch",
              "deckWinrate": 37.22,
              "deckPopularity": 1.45,
              "playedWinrate": 40.23,
              "drawnWinrate": 39.37,
              "timesPlayed": 3477,
              "keepPercentage": 65.92
            }
          ]
        },
        "social": {
          "mentions": {
            "total": 2,
            "reddit": 2,
            "x": 0
          },
          "sentiment": "mixed",
          "stance": "divided",
          "summary": "Автор поста про Armor Pirate Warrior получил 58% винрейта на 50 играх, другой игрок вышел в Легенду на дешёвой агрессивной сборке с броней. Сообщество пока не требует баффа массово.",
          "topPosts": [
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xd4mln",
              "url": "https://reddit.com/r/CompetitiveHS/comments/1xd4mln/armor_pirate_warrior_using_the_new_armor_package/",
              "author": "DWFishQ",
              "score": 34,
              "comments": 9,
              "title": "Armor Pirate Warrior: Using the New Armor Package Aggressively",
              "excerpt": "Hi everyone! Here to share my Warrior deck that I am having success with. I was already hard climbing from 700+ to 400+ with this deck before the Priest quest ban, and then pushing further from there to 200+, currently staying there with a run of 29-21 (58% win rate). Of course, …",
              "community": "r/CompetitiveHS",
              "createdAt": "2026-10-23T04:46:23.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xe2h7z",
              "url": "https://reddit.com/r/hearthstone/comments/1xe2h7z/cheap_legend_aggro_armor_warrior/",
              "author": "Straight-Heat1511",
              "score": 25,
              "comments": 4,
              "title": "Cheap Legend : Aggro Armor Warrior",
              "excerpt": "Hi guys,  I climbed from Diamond 10 to Legend in one evening (first time in the year Scarab!) with this fairly cheap deck. My main opponents and best matchups were ritual warlocks, handbuff DeathKnight and paladins. I do a lot of homebrews and this was my most successful deck of …",
              "community": "r/hearthstone",
              "createdAt": "2026-10-24T07:39:09.000Z",
              "official": false,
              "citedByModel": true
            }
          ]
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": null,
          "statsFetchedAt": "2026-10-25T06:01:39.545307+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        },
        "precedents": [
          {
            "patch": "36.4.2",
            "date": "2026-09-04T00:48:51+00:00",
            "setAgeDays": null,
            "preStats": null,
            "postStats": null,
            "url": null,
            "summary": null,
            "id": "36.4.2:EDR_489",
            "cardId": "EDR_489",
            "dbfId": null,
            "name": "Агамагган",
            "nameEn": null,
            "class": "WARLOCK",
            "direction": "buff",
            "changes": [
              {
                "field": "attack",
                "before": 8,
                "after": 9
              }
            ],
            "similarity": [
              "cited"
            ],
            "citedByModel": true
          }
        ]
      },
      {
        "ref": "class:standard:MAGE",
        "kind": "class",
        "id": "MAGE",
        "dbfId": null,
        "name": "Маг",
        "nameEn": "Mage",
        "class": "MAGE",
        "className": "Маг",
        "imageUrl": null,
        "cost": null,
        "rarity": null,
        "set": null,
        "confidence": 36,
        "headline": "Маг застрял на слабых архетипах и жалуется на новые карты",
        "verdict": "Класс показывает 49,11% при 2,8% доли игр. Summoner Mage — 48,9% (45,8% на Легенде), Leyline Mage — 48,0% (43,7% на Легенде, -4,3 п.п. за сутки), Quest Mage — 47,6%. Новые легендарки Изисет (45,0%) и Диски Норганнона (44,8%) на Легенде тоже слабы. Сигнал умеренный: у Burn Mage есть поклонники, но Маг заметно отстаёт от верхушки меты.",
        "reasons": [
          "Винрейт класса 49,11% при 2,8% популярности",
          "Архетипы на Легенде 43,7–46,4%",
          "Новые легендарные карты Мага на Легенде 44,8–45,0%"
        ],
        "suggestedChange": "Изисет: стоимость 6 → 5",
        "stats": {
          "source": "hsguru",
          "rank": "all",
          "period": "black_empire_ban",
          "winrate": 49.11,
          "popularity": 2.8,
          "games": 38699,
          "topArchetypes": [
            "Summoner Mage",
            "Leyline Mage",
            "Burn Mage",
            "Quest Mage",
            "Manastorm Mage"
          ],
          "trend": null,
          "periods": []
        },
        "social": {
          "mentions": {
            "total": 16,
            "reddit": 15,
            "x": 1
          },
          "sentiment": "mixed",
          "stance": "wants_buff",
          "summary": "Пост игрока «I just wanna play with my new mage toys…» набрал 432 очка: автору приходится туго против меты. Другой автор хвалит Burn Mage, так что оценки смешанные.",
          "topPosts": [
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xceyeq",
              "url": "https://reddit.com/r/hearthstone/comments/1xceyeq/i_just_wanna_play_with_my_new_mage_toys/",
              "author": "anomalusx",
              "score": 432,
              "comments": 109,
              "title": "I just wanna play with my new mage toys…",
              "excerpt": "I'm gettin curb stomped out here it's brutal 😭",
              "community": "r/hearthstone",
              "createdAt": "2026-10-22T10:32:27.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1x9wbau",
              "url": "https://reddit.com/r/hearthstone/comments/1x9wbau/new_expac_inc_what_have_been_your_top_3_decks/",
              "author": "Ready_Commission489",
              "score": 12,
              "comments": 34,
              "title": "New Expac Inc - What Have Been your Top 3 Decks This Season?",
              "excerpt": "First season back in hearthstone since the OG days  I hit legend back then, and hit legend again this time after getting super into hearthstone again 11 years later   I've played a range of decks this season & have found a good number super fun  NO.1 - BURN Mage  You start pressu…",
              "community": "r/hearthstone",
              "createdAt": "2026-10-19T13:02:53.000Z",
              "official": false,
              "citedByModel": true
            },
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xb9m9k",
              "url": "https://reddit.com/r/hearthstone/comments/1xb9m9k/ice_block_doesnt_protect_from_ghuun_and_thats/",
              "author": "alasthor1313",
              "score": 77,
              "comments": 9,
              "title": "Ice Block doesn't protect from G'huun and that's great",
              "excerpt": "Unlimited Ice Block in Wild is literally the most non-interactive BS in the entire game. So glad G'huun is finally punishing these Mage OTPs who just stall forever. Enjoy actually having to play the game now instead of relying on a broken secret to stay alive!",
              "community": "r/hearthstone",
              "createdAt": "2026-10-21T01:07:08.000Z",
              "official": false,
              "citedByModel": false
            }
          ]
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": null,
          "statsFetchedAt": "2026-10-24T22:00:03.510913+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        }
      },
      {
        "ref": "card:BE_541",
        "kind": "card",
        "id": "BE_541",
        "dbfId": 130761,
        "name": "Агент Н'Зота",
        "nameEn": "Agent of N'Zoth",
        "class": "ROGUE",
        "className": "Разбойник",
        "imageUrl": "https://art.hearthstonejson.com/v1/256x/BE_541.png",
        "cost": 2,
        "rarity": "RARE",
        "set": "BE",
        "confidence": 32,
        "headline": "Агент Н'Зота — самая слабая карта из пула",
        "verdict": "Винрейт на Легенде составляет всего 30,74% при 0,71% популярности за 7 дней, на Даймонде 37,4%. Это самый низкий показатель среди карт пула, и карта почти не играется. При этом класс Разбойник в целом держится около 48,8%, а AYAYA Rogue показывает 51,4%, так что бафф был бы точечным.",
        "reasons": [
          "30,74% на Легенде — самый низкий винрейт в пуле",
          "Популярность 0,71% — карту фактически не играют",
          "Новая карта расширения, которую никто не использует"
        ],
        "suggestedChange": "Стоимость 2 → 1",
        "stats": {
          "source": "hsreplay",
          "rank": "legend",
          "period": "7d",
          "winrate": 30.74,
          "popularity": 0.71,
          "playedWinrate": 32.77,
          "drawnWinrate": 31.9,
          "timesPlayed": 2700,
          "keepPercentage": 81.12,
          "trend": {
            "popularityDelta": -0.16,
            "playedWinrateDelta": -0.19,
            "basis": "popularity 1d − 7d, played winrate 3d − 14d, rank legend"
          },
          "periods": [
            {
              "rank": "legend",
              "period": "1d",
              "deckWinrate": 30.1,
              "deckPopularity": 0.55,
              "playedWinrate": 34.78,
              "drawnWinrate": 33.71,
              "timesPlayed": 710,
              "keepPercentage": 85.71
            },
            {
              "rank": "legend",
              "period": "3d",
              "deckWinrate": 30.67,
              "deckPopularity": 0.9,
              "playedWinrate": 32.86,
              "drawnWinrate": 31.95,
              "timesPlayed": 2370,
              "keepPercentage": 81.2
            },
            {
              "rank": "legend",
              "period": "7d",
              "deckWinrate": 30.74,
              "deckPopularity": 0.71,
              "playedWinrate": 32.77,
              "drawnWinrate": 31.9,
              "timesPlayed": 2700,
              "keepPercentage": 81.12
            },
            {
              "rank": "legend",
              "period": "14d",
              "deckWinrate": 31.05,
              "deckPopularity": 0.51,
              "playedWinrate": 33.05,
              "drawnWinrate": 32.39,
              "timesPlayed": 2841,
              "keepPercentage": 81.47
            },
            {
              "rank": "legend",
              "period": "patch",
              "deckWinrate": 30.91,
              "deckPopularity": 0.86,
              "playedWinrate": 32.98,
              "drawnWinrate": 32.36,
              "timesPlayed": 2580,
              "keepPercentage": 81.88
            }
          ]
        },
        "social": {
          "mentions": {
            "total": 1,
            "reddit": 1,
            "x": 0
          },
          "sentiment": "neutral",
          "stance": "indifferent",
          "summary": "Карта упоминается только в посте о хотфиксе 37.0.1, без оценки силы.",
          "topPosts": [
            {
              "platform": "reddit",
              "kind": "post",
              "id": "reddit:1xa02sx",
              "url": "https://reddit.com/r/hearthstone/comments/1xa02sx/3701_hotfix_patch_rolling_out_on_october_19/",
              "author": "HearthstoneTeam",
              "score": 75,
              "comments": 40,
              "title": "37.0.1 Hotfix Patch - Rolling out on October 19",
              "excerpt": "Hello everyone! Patch 37.0.1 is a server-side hotfix patch, rolling out **October 19**. Please see the lists below for details.  # Bug Fixes and Game Improvements  # Hearthstone  * [Hammer of Archaedas](https://hearthstone.blizzard.com/cards/132338/) no longer causes a disconnect…",
              "community": "r/hearthstone",
              "createdAt": "2026-10-19T15:32:56.000Z",
              "official": false,
              "citedByModel": true
            }
          ]
        },
        "dates": {
          "firstFlaggedAt": "2026-10-25T10:12:15+00:00",
          "previousConfidence": null,
          "statsFetchedAt": "2026-10-25T06:01:39.545307+00:00",
          "socialWindowFrom": "2026-10-18T00:00:00+00:00",
          "socialWindowTo": "2026-10-25T10:10:48+00:00"
        }
      }
    ],
    "patch": {
      "version": "37.0.0.254477",
      "title": "37.0 Patch Notes",
      "titleRu": "Обновление 37.0: «Власть Темной Империи», предрелизная потасовка и новый сезон Арены",
      "url": "https://playhearthstone.com/en-us/blog/24301454",
      "publishedAt": "2026-10-12T16:55:00+00:00"
    },
    "statsPeriods": {
      "available": [
        "past_3_hours",
        "past_6_hours",
        "past_day",
        "past_3_days",
        "past_week",
        "past_2_weeks",
        "past_30_days",
        "patch_36.6.3",
        "black_empire",
        "black_empire_ban"
      ],
      "current": "black_empire",
      "patch": "patch_36.6.3",
      "ban": "black_empire_ban",
      "primary": "black_empire_ban",
      "used": [
        "past_day",
        "past_3_days",
        "past_week",
        "patch_36.6.3",
        "black_empire",
        "black_empire_ban"
      ]
    },
    "model": "claude-sonnet-5-5",
    "requestedModel": "claude-sonnet-5-5",
    "sources": [
      {
        "id": "hsguru_meta_matrix",
        "kind": "stats",
        "fetchedAt": "2026-10-24T22:00:03.510913+00:00",
        "items": 52
      },
      {
        "id": "hsreplay_cards_legend_1d",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:29.543020+00:00",
        "items": 1226
      },
      {
        "id": "hsreplay_cards_legend_3d",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:29.627914+00:00",
        "items": 1281
      },
      {
        "id": "hsreplay_cards_legend_7d",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:32.354121+00:00",
        "items": 1299
      },
      {
        "id": "hsreplay_cards_legend_14d",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:31.872482+00:00",
        "items": 1309
      },
      {
        "id": "hsreplay_cards_legend_patch",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:34.588894+00:00",
        "items": 1288
      },
      {
        "id": "hsreplay_cards_diamond_4_1_1d",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:35.018102+00:00",
        "items": 1104
      },
      {
        "id": "hsreplay_cards_diamond_4_1_3d",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:37.020221+00:00",
        "items": 1218
      },
      {
        "id": "hsreplay_cards_diamond_4_1_7d",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:36.638702+00:00",
        "items": 1273
      },
      {
        "id": "hsreplay_cards_diamond_4_1_14d",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:38.797388+00:00",
        "items": 1284
      },
      {
        "id": "hsreplay_cards_diamond_4_1_patch",
        "kind": "stats",
        "fetchedAt": "2026-10-25T06:01:39.545307+00:00",
        "items": 1243
      },
      {
        "kind": "social",
        "id": "reddit:r/hearthstone:hot",
        "platform": "reddit",
        "state": "ok",
        "items": 100
      },
      {
        "kind": "social",
        "id": "reddit:r/hearthstone:top:week",
        "platform": "reddit",
        "state": "ok",
        "items": 100
      },
      {
        "kind": "social",
        "id": "reddit:r/hearthstone:search:balance",
        "platform": "reddit",
        "state": "ok",
        "items": 100
      },
      {
        "kind": "social",
        "id": "reddit:r/CompetitiveHS:hot",
        "platform": "reddit",
        "state": "ok",
        "items": 99
      },
      {
        "kind": "social",
        "id": "reddit:r/CompetitiveHS:top:week",
        "platform": "reddit",
        "state": "ok",
        "items": 16
      },
      {
        "kind": "social",
        "id": "reddit:r/CompetitiveHS:search:balance",
        "platform": "reddit",
        "state": "ok",
        "items": 3
      },
      {
        "kind": "social",
        "id": "reddit:r/wildhearthstone:hot",
        "platform": "reddit",
        "state": "ok",
        "items": 100
      },
      {
        "kind": "social",
        "id": "reddit:r/wildhearthstone:top:week",
        "platform": "reddit",
        "state": "ok",
        "items": 78
      },
      {
        "kind": "social",
        "id": "reddit:r/wildhearthstone:search:balance",
        "platform": "reddit",
        "state": "ok",
        "items": 17
      },
      {
        "kind": "social",
        "id": "reddit:r/hearthstone:search:balance:new",
        "platform": "reddit",
        "state": "ok",
        "items": 100
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xc2n4e",
        "platform": "reddit",
        "state": "ok",
        "items": 50
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xdju41",
        "platform": "reddit",
        "state": "ok",
        "items": 50
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xchk37",
        "platform": "reddit",
        "state": "ok",
        "items": 46
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xdnsgb",
        "platform": "reddit",
        "state": "ok",
        "items": 22
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xb99wg",
        "platform": "reddit",
        "state": "ok",
        "items": 50
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xdcp4d",
        "platform": "reddit",
        "state": "ok",
        "items": 48
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xbi2nm",
        "platform": "reddit",
        "state": "ok",
        "items": 44
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xeplz2",
        "platform": "reddit",
        "state": "ok",
        "items": 22
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xd5l6d",
        "platform": "reddit",
        "state": "ok",
        "items": 35
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xcwe63",
        "platform": "reddit",
        "state": "ok",
        "items": 32
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xdv3to",
        "platform": "reddit",
        "state": "ok",
        "items": 16
      },
      {
        "kind": "social",
        "id": "reddit:comments:1xa02sx",
        "platform": "reddit",
        "state": "ok",
        "items": 33
      },
      {
        "kind": "social",
        "id": "x:search:balance:top",
        "platform": "x",
        "state": "ok",
        "items": 15
      },
      {
        "kind": "social",
        "id": "x:search:balance:latest",
        "platform": "x",
        "state": "ok",
        "items": 18
      },
      {
        "kind": "social",
        "id": "x:official:latest",
        "platform": "x",
        "state": "ok",
        "items": 20
      },
      {
        "kind": "social",
        "id": "x:creators:latest",
        "platform": "x",
        "state": "ok",
        "items": 7
      },
      {
        "kind": "social",
        "id": "x:search:entities:top",
        "platform": "x",
        "state": "ok",
        "items": 12
      },
      {
        "kind": "social",
        "id": "x:search:wild:top",
        "platform": "x",
        "state": "ok",
        "items": 2
      }
    ],
    "socialWindow": {
      "from": "2026-10-18T00:00:00+00:00",
      "to": "2026-10-25T10:10:48+00:00",
      "posts": 362,
      "comments": 400,
      "postsSentToModel": 120
    },
    "history": null
  },
  "meta": {
    "source_id": "balance_radar",
    "fetched_at": "2026-10-25T10:12:15+00:00",
    "stale": false,
    "count": 9
  }
};
