const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] ?? character);

export function interactionView(name: string, audience: string, csrf: string): string {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Вход на Манакост — HearthPulse</title><style>
    body{margin:0;background:#062638;color:#f4f7fa;font:1rem/1.6 Arial,sans-serif}
    main{max-width:36rem;margin:8vh auto;padding:2rem}h1{font-size:1.75rem;line-height:1.25}
    p{overflow-wrap:anywhere}form{display:flex;gap:1rem;flex-wrap:wrap}
    button{font:inherit;min-height:44px;padding:.75rem 1.5rem;border:1px solid #9cb6c8;border-radius:4px;background:#143f55;color:#fff;cursor:pointer}
    button[value=continue]{background:#236ba5}button:focus-visible{outline:3px solid #fff;outline-offset:4px}
    a{color:#a8d8ff}small{color:#bccbd5}</style>
    <main><p>HEARTHPULSE / МАНАКОСТ</p><h1>Войти на Манакост</h1>
    <p>Вы вошли как <strong>${escape(name || 'Читатель')}</strong>.</p>
    <p>Сайт <strong>${escape(audience)}</strong> получит ваш идентификатор и имя профиля. Пароль, почта и платёжные данные не передаются.</p>
    <form method="post"><input type="hidden" name="csrf" value="${escape(csrf)}">
    <button name="decision" value="continue" type="submit">Продолжить</button>
    <button name="decision" value="deny" type="submit">Отмена</button></form>
    <p><small>Аккаунт остаётся в HearthPulse. Выход или отзыв этой сессии HearthPulse также закроет доступ к кабинету Манакоста.</small></p></main></html>`;
}
