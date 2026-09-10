# Transition.js — guide

Transition.js fait des présentations en HTML et CSS. Le moteur ne sait faire qu'une chose : à chaque pas de la présentation, basculer des classes et incrémenter des variables CSS sur des éléments. Tout ce qui se voit — le passage d'une diapo à l'autre, l'apparition d'un point, la couleur d'une formule — est écrit en CSS.

Les exemples tournent en ligne sur https://pantz.pages.math.cnrs.fr/transitionjs/ ; le dépôt est sur https://plmlab.math.cnrs.fr/pantz/transitionjs.

Contenu :

1. [Démarrage](#1-démarrage)
2. [Diapositives](#2-diapositives)
3. [Fragments](#3-fragments)
4. [Règles](#4-règles)
5. [Modes d'affichage](#5-modes-daffichage)
6. [Navigation](#6-navigation)
7. [Thèmes](#7-thèmes)
8. [API et événements](#8-api-et-événements)
9. [Compagnons : sommaire, graphes, MathJax](#9-compagnons)
10. [Migration depuis la version 1](#10-migration-depuis-la-version-1)
11. [Sondages en direct](#11-sondages-en-direct)
12. [Tests](#12-tests)
13. [Pièges connus](#13-pièges-connus)

## 1. Démarrage

Fichiers :

```
transition.js        le moteur
transition.css       la mise en page (obligatoire)
themes/base.css      mise en page « document » : titres en haut, contenu centré
themes/layouts.css   colonnes, centrage, blocs, listes, tableaux, figures — sans écrire de CSS
themes/beamer.css    dans l'esprit de beamer, avec sommaire persistant (nécessite base.css et layouts.css)
themes/sarah.css     thème libre : positionnement absolu, tailles, effets (autonome)
tableofcontents.js   génération de sommaires
graph.js             tracé de fonctions en SVG
poll.js, poll.css    sondages en direct (avec le serveur de server/)
examples/            minimal, beamer, tour, fade, newton (le même exposé en beamer et en Transition.js)
```

Squelette :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="transition.css">
  <link rel="stylesheet" href="themes/base.css">
</head>
<body>
  <div id="slides">
    <section><div><h1>Titre</h1></div></section>
    <section>
      <h3>Une diapo</h3>
      <div>
        <p>Toujours visible.</p>
        <p class="hidden" data-fragments="{hidden} 0.5s">Apparaît au pas suivant.</p>
      </div>
    </section>
  </div>

  <div id="navigate"><span id="arrowUp">▲</span> <span id="arrowDown">▼</span></div>

  <script src="transition.js"></script>
  <script>TransitionJS.init();</script>
</body>
</html>
```

`init()` sans argument installe trois règles par défaut (§ 4) : chaque diapo sauf la première incrémente `--shift` sur `#slides` — `transition.css` traduit `--shift` en décalage vertical —, les enfants d'un élément `.steps` apparaissent un à un, et les éléments `.pause` aussi. Voir `examples/minimal.html`.

## 2. Diapositives

Une diapositive est un **enfant direct de `#slides`**, quel que soit son type. En pratique :

- `<section>` pour une diapo ordinaire ;
- `<h2>` pour une page de partie (un titre seul, centré) — c'est une diapo comme les autres, adressable par l'URL et cliquable dans la vue d'ensemble.

Un enfant portant l'attribut `data-tj-ignore` n'est pas une diapo.

Les éléments fixes (logo, pied de page, barre de sommaire) se placent **hors de `#slides`**, avec `position: fixed`. À l'intérieur, ils compteraient comme des diapos, et la vue d'ensemble — qui applique une transformation à `#slides` — les emporterait avec elle.

Chaque diapo, sauf la première, doit porter un fragment qui l'amène à l'écran (en général `[slides]{--shift++}` via une règle). Le moteur signale en console les diapos qui n'en ont pas.

## 3. Fragments

Un fragment est une instruction placée dans un attribut `data-fragments`. Plusieurs fragments peuvent se suivre, séparés par des espaces.

```
[temps] [cibles] {jetons} [durée] [délai]
```

| Partie | Forme | Sens |
|---|---|---|
| temps | *(rien)* | pas suivant : le curseur avance de 1 |
| | `+n` | curseur + n ; le curseur ne bouge pas (`+0` = même pas que le fragment précédent) |
| | `-n` | curseur − n ; le curseur ne bouge pas |
| | `#n` | pas absolu n ; le curseur est placé à n |
| cibles | `[id1,id2]` | éléments désignés par leur `id` |
| | `[this]` | l'élément qui porte l'attribut (défaut) |
| | `[slide]` | la diapo qui contient l'élément |
| jetons | `nom` | bascule la classe `nom` |
| | `--var++` | incrémente la propriété personnalisée `--var` |
| | `--var--` | la décrémente |
| durée | `0.5s` | durée de la transition (0 par défaut : instantané) |
| délai | `0.2s` | délai avant la transition, en marche avant seulement |

### Le curseur

Le curseur est **global au document** : les attributs `data-fragments` sont lus dans l'ordre du HTML, et chaque fragment sans indication de temps prend le pas suivant. L'ordre naturel du document est donc l'ordre naturel de la présentation, et il n'y a rien à numéroter.

```html
<section data-fragments="[slides]{--shift++} 1s">   <!-- pas 5 : la diapo arrive -->
  <p class="hidden" data-fragments="{hidden}">A</p>  <!-- pas 6 -->
  <p class="hidden" data-fragments="{hidden}">B</p>  <!-- pas 7 -->
  <p class="hidden" data-fragments="+0{hidden}">C</p><!-- pas 7 aussi -->
</section>
```

`+n` et `-n` permettent de grouper ou d'anticiper sans déplacer le curseur ; `#n` fixe un pas absolu et y place le curseur, ce qui permet de reprendre la numérotation relative après lui. Un fragment dont le temps vaut 0 ou moins n'est jamais appliqué (avertissement en console).

### Retour en arrière

Reculer d'un pas applique l'inverse des fragments de ce pas : les classes sont rebasculées, les variables décrémentées, avec la même durée mais sans délai. Le moteur ne mémorise rien d'autre : n'ajoutez ou ne retirez pas vous-même une classe pilotée par un fragment, sinon l'aller et le retour ne se correspondent plus.

### Durées et délais

Le moteur pose `--tj-duration` et `--tj-delay` sur les cibles du fragment, et `transition.css` lie `transition` à ces deux variables pour tout élément qui est cible d'un fragment :

```css
[data-tj-target] { transition: all var(--tj-duration, 0s) var(--tj-delay, 0s); }
```

Conséquence : **un fragment sans durée est instantané**, quel que soit le thème. Pour animer une seule propriété, ou donner une durée par défaut, un thème peut remplacer cette règle :

```css
.item { transition: opacity var(--tj-duration, 0.4s); }
```

### Exemples

```html
<!-- apparaît ; au pas suivant, grossit en 1 s ; au pas d'après, rétrécit en 2 s -->
<div class="hidden" data-fragments="{hidden} {big} 1s +1{small} 2s">…</div>

<!-- fait apparaître le pied de page (élément hors diapo) en même temps que soi -->
<div class="hidden" data-fragments="{hidden} +0[footnote]{removed}">Note</div>

<!-- change l'allure de toute la diapo -->
<div data-fragments="[slide]{newlook}">Nouveau look</div>

<!-- colore un morceau d'équation MathJax -->
<div data-fragments="[frac]{pink} 0.5s">…</div>
```

## 4. Règles

Écrire `[slides]{--shift++} 1s` sur chaque diapo est fastidieux. Les règles font le travail par sélecteur, avant l'analyse :

```js
TransitionJS.init({
  rules: [
    { selector: '#slides > :not(:first-child)',   fragments: '[slides]{--shift++} 0.4s' },
    { selector: '#slides > h2:not(:first-child)', fragments: '[slides]{--shift++} 0.4s +0[toc]{--current++} 0.4s' },
  ],
});
```

Priorités, à la manière de CSS :

1. un `data-fragments` écrit dans le HTML l'emporte toujours sur les règles ;
2. entre règles, seule la plus spécifique s'applique ; à égalité, la dernière ;
3. **les règles ne se concatènent pas** : la seconde règle ci-dessus doit répéter `--shift++`.

Notez le `+0` de la seconde règle : chaque `{…}` est un fragment, et un fragment sans indication de temps avance le curseur. Sans `+0`, le sommaire changerait un pas *après* l'arrivée de la page de partie.

La spécificité est celle de CSS (`:not()` compte comme son argument, `:where()` compte pour zéro). D'où le `:not(:first-child)` sur la règle des `h2` : sans lui, `#slides > h2` (1,0,1) perdrait contre `#slides > :not(:first-child)` (1,1,0).

Pour exclure une diapo d'une règle, un `data-fragments=""` vide suffit : c'est un attribut en ligne, il gagne, et il ne contient rien.

### Règles par défaut

Sauf `defaultRules: false`, `init` installe, avant les vôtres :

| Sélecteur | Fragments | Rôle |
|---|---|---|
| `#slides > :not(:first-child)` | `[slides]{--shift++} 0.6s` (ou `{active} 0.6s` si `#slides` a la classe `fade`) | amener chaque diapo à l'écran |
| `.steps > *` | `{shown} 0.4s` | l'équivalent de `\begin{itemize}[<+->]` |
| `.pause` | `{shown} 0.4s` | l'équivalent de `\pause` |

`transition.css` masque `.steps > *` et `.pause` tant qu'ils ne portent pas `shown`. Vos règles viennent après : à spécificité égale, la dernière gagne, donc `{ selector: '.steps > *', fragments: '{shown}' }` suffit à rendre les apparitions instantanées.

## 5. Modes d'affichage

Le mode est une classe sur `#slides`, la navigation est identique dans les trois cas.

**Colonne** (défaut) — les diapos sont empilées verticalement, `#slides` remonte de `--shift` hauteurs d'écran. Fragment : `[slides]{--shift++}`.

**Ligne** (`class="inline"`) — même chose horizontalement.

**Fondu** (`class="fade"`) — les diapos sont superposées et invisibles ; une diapo portant la classe `active` est visible et recouvre les précédentes. Fragment : `{active}` sur chaque diapo sauf la première.

C'est ce que fait la règle par défaut quand `#slides` porte la classe `fade`.

Reculer retire `active` de la diapo courante, et la précédente réapparaît dessous. Voir `examples/fade.html`.

## 6. Navigation

| Action | Commande |
|---|---|
| Avancer | Espace, Entrée, →, ↓, Page suiv., flèche `#arrowDown`, glisser vers la gauche ou le haut |
| Reculer | ←, ↑, Page préc., flèche `#arrowUp`, glisser vers la droite ou le bas |
| Début / fin | Début / Fin |
| Vue d'ensemble | Échap ; cliquer sur une diapo pour s'y rendre, Échap ou Entrée pour revenir |

Les touches sont ignorées quand le focus est dans un champ de saisie ou quand une touche de modification est enfoncée.

### URL

L'URL suit la diapo courante : `#id` si la diapo a un `id`, sinon `#n` avec n son rang (à partir de 1). Cela permet :

- d'ouvrir la présentation directement sur une diapo (`slides.html#conclusion`) ;
- de mettre des liens internes `<a href="#conclusion">` ;
- de modifier l'URL à la main.

Dans les trois cas, le moteur rejoue les pas nécessaires, sans animation, jusqu'au début de la diapo demandée. Les clics sur les liens `<a href="#id">` vers une diapo sont pris en charge par le moteur, qui empêche le navigateur de faire en plus défiler le document vers l'élément visé — c'est ce qui rendait ces liens inutilisables dans la version 1. L'historique du navigateur n'est pas alimenté par la navigation (le bouton Retour ne remonte pas dans les diapos, c'est voulu). Un hash inconnu est remplacé par celui de la diapo courante.

### Vue d'ensemble

Échap ajoute la classe `navigate` à `<body>` : `transition.css` dispose alors les diapos en grille réduite. Deux variables la règlent, à surcharger dans un thème :

```css
body.navigate #slides { --scale: 0.15; --columns: 6; }
```

Les éléments fixes (`#toc`, `#footline`, `#navigate`, `#logo`…) sont masqués par les thèmes en mode `navigate`. La diapo courante porte la classe `tj-current` (voir plus bas).

## 7. Thèmes

`transition.css` ne fait que la mise en page ; un thème fait le reste. Ce que le moteur met à disposition du CSS :

| Sur | Quoi | Sens |
|---|---|---|
| `#slides` | `--shift` | rang de la diapo courante |
| cibles des fragments | `data-tj-target`, `--tj-duration`, `--tj-delay` | voir § 3 |
| chaque diapo | `tj-current`, `tj-past`, `tj-future` | position par rapport à la diapo courante |
| `#arrowUp`, `#arrowDown` | `inactive` | au début / à la fin |
| `<body>` | `navigate` | vue d'ensemble |

### base.css

Une diapo `<section>` est une colonne : les titres `<h3>` et `<h4>` en haut, un `<div>` final qui prend le reste de la hauteur et centre son contenu. Les `<h2>` enfants de `#slides` sont des pages de partie centrées. Classes utilitaires : `hidden` (opacité 0), `removed` (retiré du flux), `small`.

### layouts.css

Indépendant du thème, à charger après `transition.css`. Pour qui ne veut pas écrire de CSS :

| Besoin | HTML |
|---|---|
| Deux colonnes | `<div class="columns"><div>…</div><div>…</div></div>` ; `style="--w:2"` sur une colonne pour la doubler ; `.columns.middle` aligne verticalement |
| Centrer un bloc dans la diapo | `<div class="centered">…</div>` (les deux axes) ; `.center`, `.left`, `.right` pour le texte |
| Pousser en haut ou en bas | `.top`, `.bottom` |
| Blocs à la beamer | `<div class="block"><h5>Titre</h5><p>…</p></div>` ; `.block.alert`, `.block.example` |
| Listes | réglées pour l'écran (espacement, puces colorées, sous-listes plus petites) ; `.plain` sans puces, `.inline` sur une ligne, `.tight` serrée |
| Tableaux | centrés, en-têtes soulignés ; `.lines` filets horizontaux, `.zebra`, `.full` pleine largeur, `.left` sur une cellule |
| Figures | `<figure><svg>…</svg><figcaption>…</figcaption></figure>` |
| Apparitions | `<ul class="steps">`, `class="pause"` (règles par défaut) |
| Accents | `.emph` (couleur de structure), `.alert` (couleur d'alerte), `.small`, `.big` |

Les couleurs viennent de trois variables que le thème peut redéfinir : `--structure`, `--alert`, `--example`.

### beamer.css

À charger après `base.css` et `layouts.css`. Le texte y est plus petit qu'ailleurs (4,5 vh) et coule depuis la gauche, comme dans beamer ; `class="center"` sur le `<div>` principal centre une diapo (page de titre, remerciements). Structure attendue, tout est optionnel :

```html
<nav id="toc"></nav>                               <!-- barre de sommaire, en haut -->
<div id="footline"><span>Auteur</span><span>Titre</span></div>   <!-- en bas -->
<div id="slides" class="pagenumber">                <!-- pagenumber : numéro en bas à droite de chaque diapo -->
  <section><div><hgroup><h1>Titre</h1><h4>Sous-titre</h4></hgroup><address>…</address><time>…</time></div></section>
  <section><h3>Sommaire</h3><div><nav class="toc"></nav></div></section>
  <h2>Première partie</h2>
  <section>
    <h3>Titre de la diapo</h3>
    <h4>Sous-titre</h4>
    <div>
      <div class="block"><h5>Théorème</h5><p>…</p></div>
    </div>
  </section>
</div>
```

Les listes suivent le thème Warsaw de beamer : une petite bille pour les puces, une bille numérotée pour les énumérations, à la couleur du bloc qui les contient. Le numéro de page n'est affiché que si `#slides` porte la classe `pagenumber` (Warsaw n'en affiche pas).

L'exemple `examples/newton/` contient le même exposé en `newton.tex` et `newton.html`, structure pour structure ; c'est la meilleure façon de voir la correspondance.

**Le sommaire persistant.** C'est le point que beamer rend difficile à reproduire, et il se règle sans sortir de la philosophie de Transition.js :

1. `tableofcontents.js` remplit `#toc` et `.toc` avec la liste des pages de partie, et donne à chaque entrée une variable `--i` : le numéro de sa partie.
2. Une règle incrémente `--current` sur `#toc` à chaque page de partie (c'est la seconde règle du § 4).
3. Le CSS compare `--i` et `--current` pour chaque entrée :

```css
#toc li {
  --d:      calc(var(--i) - var(--current));
  --abs:    max(var(--d), calc(-1 * var(--d)));
  --future: clamp(0, calc(var(--d) * 1000), 1);   /* 1 si à venir */
  --now:    clamp(0, calc(1 - var(--abs)), 1);    /* 1 si partie courante */
  opacity:     calc(1 - 0.6 * var(--future));
  font-weight: calc(400 + 300 * var(--now));
}
```

Partie visitée : normale. Partie courante : grasse et soulignée. Partie à venir : estompée. Le JavaScript n'a rien fait d'autre qu'un `++`, et un retour en arrière est un `--`. Voir `examples/beamer.html`.

### sarah.css

Thème autonome de style libre : classes de position (`center`, `middle`, `left`, `right`, `full`), de taille (`Huge`, `big`, `normal`, `small`, `tiny`), d'effet (`blink`, `blur`, `bottom`, `boxed`), et `#logo`, `#footnote`. Voir `examples/tour.html`.

### Écrire un thème

Trois choses à savoir :

- ne déclarez pas de `transition` sur `#slides` : `transition.css` s'en charge via `--tj-duration` ;
- un fragment sans durée est instantané ; si un élément doit toujours s'animer, donnez-lui `transition: … var(--tj-duration, 0.4s)` ;
- pensez à `body.navigate` pour masquer vos éléments fixes.

## 8. API et événements

```js
const deck = TransitionJS.init({
  slides:    '#slides',    // conteneur (sélecteur ou élément)
  arrowUp:   '#arrowUp',   // optionnels
  arrowDown: '#arrowDown',
  rules:     [ … ],        // § 4
  defaultRules: true,      // § 4
  hash:      true,         // URL ↔ diapo courante
  keyboard:  true,
  touch:     true,
});

deck.next(); deck.prev();          // renvoient false aux extrémités
deck.goTo(step);                   // pas absolu, sans animation
deck.goToSlide(index);             // début de la diapo (à partir de 0)
deck.toggleOverview();             // vue d'ensemble
deck.destroy();                    // retire les écouteurs

deck.time;        // pas courant
deck.length;      // nombre de pas
deck.slides;      // tableau des diapos
deck.slideIndex;  // rang de la diapo courante (à partir de 0)
deck.slide;       // la diapo courante
```

`TransitionJS.init` mémorise le dernier deck créé dans `TransitionJS.deck`.

Un événement `transitionjs:change` est émis sur `document` après chaque déplacement, y compris les sauts :

```js
document.addEventListener('transitionjs:change', (e) => {
  const { time, slide, previousSlide, direction, deck } = e.detail;
});
```

Fonctions utilitaires exposées : `TransitionJS.applyRules(rules, root)`, `TransitionJS.parseFragments(root, slides)`, `TransitionJS.slidesOf(container)`, `TransitionJS.specificity(selector)`.

## 9. Compagnons

### tableofcontents.js

```js
TransitionJS.tableOfContents({
  slides: '#slides',
  target: '#toc, .toc',   // reçoit un <ul>
  parts:  'h2',           // diapos qui sont des pages de partie
  sub:    'h3',           // titres dans les diapos, en sous-entrées (null : aucune)
  links:  true,           // entrées cliquables
});
```

À appeler **avant** `init` : les pages de partie sans `id` en reçoivent un (dérivé du titre), et le moteur doit le connaître pour résoudre l'URL. Chaque `<li>` porte `toc-level-1` ou `toc-level-2` et la variable `--i`.

### graph.js

```js
const g = new graph(svgElement, [xmin, ymin, xmax, ymax]);
g.axes(2);                                            // axes fléchés
g.plot(Math.cos, [xmin, xmax], 160, 'stroke-width:3', 'maClasse', 'monId');
g.plotXY(t => Math.cos(t), t => Math.sin(t), [0, 2 * Math.PI], 200, 'stroke-width:3');
```

Les traits utilisent `currentColor`. Le SVG doit avoir une taille au moment du tracé (script en fin de `body`, ou après chargement). Pour un tracé animé, voir `.hold` / `.go` dans `sarah.css`.

### MathJax

Chargez MathJax 3, puis initialisez le deck une fois la composition terminée, afin que les identifiants créés par `\cssId` existent au moment de l'analyse :

```html
<script>window.MathJax = { tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] } };</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.js"></script>
…
<script>
  const ready = (window.MathJax && MathJax.startup) ? MathJax.startup.promise : Promise.resolve();
  ready.then(() => TransitionJS.init({ … }));   // démarre même si MathJax n'a pas pu être chargé
</script>
```

## 10. Migration depuis la version 1

| Version 1 | Version 2 |
|---|---|
| `fragments="…"` | `data-fragments="…"` (l'ancien attribut n'est plus lu) |
| `initFrag()`, `next()`, `prev()` globaux | `TransitionJS.init()` renvoie un deck ; `deck.next()`, `deck.prev()` |
| `transitionRules: [{ selector, fg }]` | `rules: [{ selector, fragments }]` (`fg` est encore accepté) |
| `section:not(:first-child)` dans la règle de défilement | `#slides > :not(:first-child)` — les `h2` sont des diapos et comptent |
| `#` seul = pas suivant ; `#n` ne déplaçait pas le curseur | `#n` seulement, et il place le curseur à n |
| `jumpToTime(n)`, `jumpToSection(i)` | `deck.goTo(n)`, `deck.goToSlide(i)` |
| événement `transitionjs:fragment` (avant le déplacement) | `transitionjs:change` (après), `transitionjs:end` supprimé |
| durées posées en `style.transition` | variables `--tj-duration` / `--tj-delay`, règle `[data-tj-target]` |
| `#logo`, `#footnote` dans `#slides` | à sortir de `#slides` |
| fichiers `abel.css` / `beamer.css` | `themes/base.css` + `themes/beamer.css` |
| `graph.draw`, `draw_axes`, `drawXY` | `plot`, `axes`, `plotXY` ; couleurs en `currentColor` |

Ce qui a été corrigé au passage : la navigation par l'URL (le premier changement de hash était avalé, et un `id` numérique était pris pour un rang), les durées qui restaient collées après un saut ou un passage en vue d'ensemble, les `h2` non décomptés, la vue d'ensemble sans CSS, Espace et Page suiv. qui faisaient défiler la page.

## 11. Sondages en direct

`poll.js` et `poll.css` (optionnels) ajoutent des questions auxquelles les étudiants répondent depuis leur téléphone, avec les résultats en direct sur la diapo. Il faut un petit serveur, fourni dans `server/` ; son `README.md` explique comment l'essayer et le déployer sur PLMshift.

Une question est un élément de la diapo :

```html
<div class="poll" data-poll="q1" data-fragments="{open} {open results} {answer}">
  <p>La méthode de Newton converge dès que f est C².</p>
  <ul>
    <li>Vrai</li>
    <li class="correct">Faux</li>
  </ul>
</div>
```

`data-poll` identifie la question dans la session ; `data-multiple` autorise plusieurs réponses ; `class="correct"` marque la ou les bonnes. Trois classes, posées par des fragments comme n'importe quelle autre, font tout : `open` (la question part sur les téléphones, les votes sont comptés), `results` (les barres), `answer` (la bonne réponse ressort). Le script ne crée aucun nœud : il écrit `--votes` sur chaque option et `--total` sur la question, et `poll.css` dessine à partir de là.

Sur la première diapo, `<div class="poll-join" data-poll-url><img class="poll-qr"></div>` affiche le QR code et l'adresse à taper. Initialisation, après `transition.js` :

```js
TransitionJS.polls({ server: 'https://…apps.math.cnrs.fr', session: 'r309-2026-09-15' });
```

Ouvrez la présentation avec `?key=…` (la clé du serveur) pour être le présentateur ; sans clé, la page n'affiche que les résultats. Voir `examples/poll.html`.

## 12. Tests

`test/run.js` vérifie la logique du moteur sous jsdom (analyse, règles, spécificité, temps de début des diapos, hash, bornes) ; `test/screenshots.js` rend les exemples dans un Chromium sans écran et écrit des captures dans `test/shots/`.

```
cd test && npm install && npm test && npm run screenshots
```

## 13. Pièges connus

- **Une diapo n'apparaît pas** : elle n'a pas de fragment qui l'amène (vérifier la console), ou un `data-fragments` en ligne l'a soustraite à la règle.
- **Le sommaire ne suit pas** : `#toc` n'est pas cible d'un fragment (il faut `+0[toc]{--current++}` dans la règle des `h2` — avec le `+0`, sinon il suit avec un pas de retard), ou `tableofcontents.js` a été appelé après `init`.
- **Une animation ne se fait pas** : le fragment n'a pas de durée. Elles sont instantanées par défaut.
- **Un élément fixe se déplace en vue d'ensemble** : il est dans `#slides`. Sortez-le.
- **Deux règles devraient s'appliquer** : elles ne se cumulent pas ; la plus spécifique doit tout contenir.
- **Un `+1` tombe au mauvais pas** : le curseur n'a pas bougé depuis le dernier fragment sans indication de temps ; relisez la section « Le curseur ».
