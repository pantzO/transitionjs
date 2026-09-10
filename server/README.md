# Serveur de sondages

Un serveur minuscule (Node, un seul fichier, une dépendance pour les QR codes) qui relie les téléphones des étudiants à la diapo. Tout est en mémoire ; rien n'est écrit sur disque ; aucune donnée personnelle — un jeton aléatoire par téléphone sert uniquement à ne compter qu'un vote par personne, et permet de changer d'avis tant que la question est ouverte.

## Comment ça marche

1. La diapo (`poll.js`) envoie la question au serveur quand son élément `.poll` reçoit la classe `open`, et la ferme quand il la perd. Ces changements de classe sont des fragments ordinaires.
2. Les étudiants ouvrent `https://<serveur>/s/<session>` — via le QR code affiché au début du cours — et voient la question courante ; ils votent en touchant une réponse.
3. Le serveur pousse les compteurs à tous les navigateurs connectés (*server-sent events*), et `poll.js` les écrit dans des variables CSS ; `poll.css` dessine les barres.

Une *session* est une chaîne quelconque (`r309-2026-09-15`), une par cours ; la diapo la déclare dans `TransitionJS.polls({ … })`. Les questions d'une session sont identifiées par leur `data-poll`.

Le présentateur est celui qui connaît la clé (`POLL_KEY` du serveur) : il ouvre sa présentation avec `?key=…` dans l'adresse. La clé est aussitôt retirée de la barre d'adresse (elle reste dans l'onglet, rechargements compris, jusqu'à sa fermeture) : tapez-la avant de brancher le projecteur. Sans clé, la même page n'affiche que les résultats — pratique pour un second écran. Avec `?key=…&reset=1`, les votes d'une séance précédente de la même session sont oubliés.

## Essai local

```
cd server
npm install
POLL_KEY=secret node server.js
```

Ouvrez `examples/poll.html?key=secret` d'un côté, `http://localhost:8080/s/demo` de l'autre (le QR code de la première diapo y mène). Depuis un téléphone sur le même réseau, remplacez `localhost` par l'adresse de votre machine — sauf sur eduroam, où les postes ne se voient pas : c'est pour cela qu'il faut un serveur sur Internet.

## Déploiement sur PLMshift

PLMshift est la plateforme d'applications de la PLM (OpenShift / OKD). Elle construit et héberge le serveur directement depuis le dépôt PLMlab. Une fois pour toutes :

**1. Le client `oc`.** Depuis la console https://plmshift.math.cnrs.fr (connexion avec le compte PLM), menu *?* → *Command line tools*, ou directement https://plmshift.math.cnrs.fr/command-line-tools : téléchargez `oc` pour Linux, puis

```
mkdir -p ~/bin && tar xf ~/Téléchargements/oc.tar -C ~/bin oc && chmod +x ~/bin/oc
```

(`export PATH=~/bin:$PATH` si le terminal ne le trouve pas tout de suite). Puis, en haut à droite de la console, votre nom → *Copy login command* → *Display token* : collez la commande `oc login --token=… --server=https://api.math.cnrs.fr:6443` dans un terminal. Le jeton expire au bout de quelques heures.

> **Le port 6443 est souvent filtré** par les réseaux d'établissement (`dial tcp …:6443: i/o timeout`). Passez par le partage de connexion d'un téléphone le temps du déploiement — `oc` ne sert qu'à ça —, ou faites tout depuis la console web : *Create a Project*, puis en vue *Developer*, *+Add* → *Import from Git* avec l'URL du dépôt, `/server` comme *Context dir*, Node.js comme constructeur, la variable d'environnement `POLL_KEY`, et une route sécurisée (*Edge*).

**2. Le projet et l'application.** Choisissez une clé longue et gardez-la (c'est elle qui protège l'ouverture des questions) :

```
oc new-project transitionjs-poll
oc new-app nodejs~https://plmlab.math.cnrs.fr/pantz/transitionjs.git \
   --context-dir=server --name=poll -e POLL_KEY='une-longue-cle-secrete'
oc create route edge poll --service=poll
oc get route poll
```

La dernière commande donne l'adresse publique, de la forme `poll-transitionjs-poll.apps.math.cnrs.fr`. La construction prend deux ou trois minutes : `oc get pods` montre d'abord `poll-1-build` (le pod qui *construit* l'image — ce n'est pas encore le serveur), et l'adresse répond « Application is not available » tant qu'il tourne. Quand il passe à `Completed`, un pod `poll-…-…` apparaît en `Running` : c'est le serveur, et l'adresse répond. `oc logs -f bc/poll` suit la construction, `oc logs deployment/poll` montre le serveur (« poll server listening on port 8080 »).

**3. Dans vos présentations :**

```js
TransitionJS.polls({ server: 'https://poll-transitionjs-poll.apps.math.cnrs.fr', session: 'r309-2026-09-15' });
```

et vous ouvrez la présentation avec `?key=une-longue-cle-secrete`.

**Mises à jour.** Après un `git push` qui touche `server/`, relancez une construction : `oc start-build poll`. (On peut aussi brancher un *webhook* GitLab pour que ce soit automatique : `oc describe bc/poll` donne l'URL à coller dans *Settings → Webhooks* du projet PLMlab.)

**Changer la clé :** `oc set env deployment/poll POLL_KEY='nouvelle-cle'` — le pod redémarre.

Le serveur redémarre aussi de lui-même si PLMshift le déplace ; les votes en cours sont alors perdus (tout est en mémoire), ce qui, entre deux séances, est exactement ce qu'on veut.

## Ce que voit le serveur

Pour chaque session : la question courante, les options, et pour chaque jeton la liste des réponses choisies. Rien d'autre — ni adresse, ni nom, ni horodatage. Les jetons sont générés par le téléphone lui-même et ne permettent pas de remonter à une personne.
