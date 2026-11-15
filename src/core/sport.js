// Riconoscimento contenuti sportivi dal nome del gruppo/canale/categoria.
const RX = /\b(sport|sports|calcio|serie ?[abc]\b|champions|europa league|conference|premier|la ?liga|bundesliga|ligue ?1|coppa|nba|nfl|nhl|mlb|f1|formula ?1|motogp|moto ?gp|motori|tennis|basket|volley|rugby|golf|boxe|ufc|wwe|mma|dazn|sky ?sport|eurosport|bein|espn|supertennis|ppv|ciclismo|giro d.italia|tour de france|olimpiadi|mondiali|europei)\b/i;
export function isSportName(s) { return !!s && RX.test(String(s)); }
export function isSportGroup(g) { return isSportName(g); }
export function isSportChannel(c) { return !!c && (isSportName(c.group) || isSportName(c.name)); }
