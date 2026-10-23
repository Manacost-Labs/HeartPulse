// Real statistics of Alexstrasza (solo, top 50%) from the BG service on 2026-10-21, trimmed to the fields the hero page reads.
// The snapshot lives beside the module so its own stories can use it; card images are filled in by
// battleground-hero-motion-data.ts so the stories never reach the network.
import snapshot from '../../src/modules/battlegrounds/ui/heroDetailSnapshot.json';

export const heroDetailStats = snapshot.stats;
export const heroDetailCards: Record<string, {
  dbf: number; card_id: string; base_card_id?: string; name: string; text: string; tavern_tier: number;
  creature_type_name?: string | null; creature_type?: string | null;
}> = snapshot.cards;

/** The hero's wiki change groups as the library API returns them. */
export const heroDetailWiki = {
  "card_changes": [
    {
      "heading": "Card changes",
      "entries": [
        {
          "date": "2026-09-03",
          "patch": "Patch 36.4.2.251332",
          "patch_title": "Обновление 36.4.2 уже в игре: баланс Стандарта, Арены и Полей сражений",
          "patch_url": "https://hs-manacost.ru/obnovlenie-36-4-2-uzhe-v-igre-balans-standarta-areny-i-polej-srazhenij/",
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_36.4.2.251332",
          "items": [
            "Now has 8 armor (previously: 10).",
            "Now has 6 armor in Duos (previously: 8)."
          ]
        },
        {
          "date": "2026-04-02",
          "patch": "Patch 35.0.3.239422",
          "patch_title": "Обновление 35.0.3: нерфы и баффы Hearthstone, последний баланс 12-го сезона Полей сражений",
          "patch_url": "https://hs-manacost.ru/obnovlenie-35-0-3-nerfy-i-baffy-hearthstone-poslednij-balans-12-go-sezona-polej-srazhenij/",
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_35.0.3.239422",
          "items": [
            "Now has 10 armor (previously: 7).",
            "Now has 8 armor in Duos (previously: 5)."
          ]
        },
        {
          "date": "2025-12-02",
          "patch": "Patch 34.2.0.231720",
          "patch_title": "Обновление 34.2 уже в игре: 12-й сезон Полей сражений, герои саги на Арене",
          "patch_url": "https://hs-manacost.ru/obnovlenie-34-2-12-j-sezon-polej-srazhenij-geroi-sagi-na-arene/",
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_34.2.0.231720",
          "items": [
            "Now has 7 armor (previously: 12).",
            "Now has 5 armor in Duos (previously: 10)."
          ]
        },
        {
          "date": "2025-10-09",
          "patch": "Patch 33.6.2.229543",
          "patch_title": "Обновление 33.6.2 уже в игре: Аномалии на Полях сражений!",
          "patch_url": "https://hs-manacost.ru/obnovlenie-33-6-2-uzhe-v-igre-anomalii-na-polyax-srazhenij/",
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_33.6.2.229543",
          "items": [
            "Now has 12 armor (previously: 5).",
            "Now has 10 armor in Duos (previously: 3)."
          ]
        },
        {
          "date": "2025-09-29",
          "patch": "Patch 33.6.0.228587",
          "patch_title": "Обновление 33.6: компаньоны на Полях сражений, предрелизные карты в Стандарте",
          "patch_url": "https://hs-manacost.ru/obnovlenie-33-6-kompanony-na-polyax-srazhenij-predreliznye-karty-v-standarte/",
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_33.6.0.228587",
          "items": [
            "Now has 5 armor (previously: 9).",
            "Now has 3 armor in Duos (previously: 7)."
          ]
        },
        {
          "date": "2025-09-17",
          "patch": "Patch 33.4.2.228373",
          "patch_title": "Обновление 33.4.2 уже в игре: 9 баффов Стандарта и 40+ изменений Полей сражений",
          "patch_url": "https://hs-manacost.ru/obnovlenie-33-4-2-uzhe-v-igre-9-baffov-standarta-i-40-izmenenij-polej-srazhenij/",
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_33.4.2.228373",
          "items": [
            "Now has 9 armor (previously: 7).",
            "Now has 7 armor in Duos (previously: 5)."
          ]
        },
        {
          "date": "2025-08-05",
          "patch": "Patch 33.2.0.225406",
          "patch_title": "Обновление 33.2 уже в игре: 11-й сезон Полей сражений, баланс и новая карта Стандарта",
          "patch_url": "https://hs-manacost.ru/obnovlenie-33-2-hearthstone/",
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_33.2.0.225406",
          "items": [
            "Now has 7 armor (previously: 5).",
            "Now has 5 armor in Duos (previously: 3)."
          ]
        },
        {
          "date": "2025-04-04",
          "patch": "Patch 32.0.3.219197",
          "patch_title": "Обновление 32.0.3: баланс Стандарта, Полей сражений и Арены",
          "patch_url": "https://hs-manacost.ru/obnovlenie-32-0-3-balans-standarta-polej-srazhenij-i-areny/",
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_32.0.3.219197",
          "items": [
            "Now has 5 armor (previously: 7).",
            "Now has 3 armor in Duos (previously: 7)."
          ]
        }
      ]
    },
    {
      "heading": "Bug fixes and other changes",
      "entries": [
        {
          "date": "2023-02-14",
          "patch": "Patch 25.4.0.165029",
          "patch_title": "Обновление 25.4 уже в игре: Возвращение в Наксрамас, новый герой Полей сражений и финал Наемников",
          "patch_url": "https://hs-manacost.ru/obnovlenie-25-4-vozvrashhenie-v-naksramas-novyj-geroj-polej-srazhenij-i-final-naemnikov/",
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_25.4.0.165029",
          "items": [
            "Rarity is now Free (previously: no rarity)."
          ]
        },
        {
          "date": "2022-06-27",
          "patch": "Patch 23.6.0.142295",
          "patch_title": null,
          "patch_url": null,
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_23.6.0.142295",
          "items": [
            "Artist is now Raymond Swanland (previously: no artist)."
          ]
        },
        {
          "date": "2021-07-27",
          "patch": "Patch 21.0.0.88998",
          "patch_title": null,
          "patch_url": null,
          "wiki_url": "https://hearthstone.wiki.gg/wiki/Patch_21.0.0.88998",
          "items": [
            "Shortened name is now Alexstrasza (previously: no name)."
          ]
        }
      ]
    }
  ]
};
