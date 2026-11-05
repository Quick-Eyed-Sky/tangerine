# Tangerine II — guide local

Tangerine II 2.1 joue la liane de Tangerine avec de vrais instruments échantillonnés (Mellotron, Fairlight, Moog, Prophet, Jupiter, Oberheim, Juno), choisis par **couleur**. Elle reprend aussi l'enregistrement d'une pièce entière de Tangerine Slides.

## Lancer

Double-cliquer sur **Tangerine II.command**. Le lanceur utilise le port 4460 : il ne se mélange pas avec Tangerine (4350) ni Tangerine Slides (4450). Garder la fenêtre Terminal ouverte.

Les samples sont lus dans le dossier **SAMPLES** à côté du dossier Tangerine (voir `samples/LISEZ-MOI.md`).

## Arrêter

**Stop** (le carré à côté du play) coupe le son et ramène la liane à sa première mesure, avec la même graine. Un enregistrement en cours est terminé et gardé dans Recordings.

## Tonalités

**Key changes** se règle en mesures entre deux changements, pour que le rythme ne dépende pas du tempo. Un changement attend un changement d'accord, et un accord dure 4 à 16 mesures : le plus rapide est donc un changement par accord.

## Choisir une couleur

Dans **The colour** : Phaedra 1974, Stratosfear / Exit, Moon Safari, Fairlight / Zoolook, ou Grand mix (tous les instruments). « Sounds change » passe d'un instrument à l'autre dans la couleur choisie.

## Enregistrer une pièce entière

1. Dans **Keep & Record**, bloc **Record a whole piece**, choisir la durée (1 min à 2 h).
2. Appuyer sur **Start from the beginning and record…**. Tangerine charge d'abord tous les samples de la couleur, puis la musique repart de sa première mesure, avec la même graine et les mêmes réglages.
3. **Intro** (10 s par défaut) : les couches entrent une par une, dans un ordre tiré de la graine. **Outro** (20 s par défaut) : elles sortent une par une, sans baisser le volume, jusqu'à ce qu'il n'en reste qu'une, de préférence une nappe tenue.
4. L'enregistrement s'arrête seul à la durée choisie.

**Tracks** (1 à 20) : pour faire plusieurs morceaux d'affilée. Avec 10 tracks de 5 minutes, Tangerine enregistre un morceau, puis remet la musique à zéro avec une autre graine et une autre tonalité, et attaque le suivant. Chaque morceau a son propre dossier, avec son WAV et son `reglages.txt`.

Deux cases à cocher, à côté des tracks :
- **Keep the tempo as it's set** : on garde le tempo réglé ; décocher pour que chaque morceau reçoive un tempo au hasard, entre 50 et 90.
- **Keep the colour** : on garde la couleur réglée ; décocher pour qu'elle change d'un morceau à l'autre (Phaedra, Fairlight, etc.).
- **Make a video (vertical, for posting)** : pour chaque morceau, un film vertical (1080 × 1920) est enregistré à côté du WAV, sous le nom `Vertical_<couleur>.mp4` (ou `.webm` selon le navigateur). On y voit le dérouleur, l'accord, la tonalité, le tempo et les cartes « Neighbour key » ou « A shared chord ». Chaque film prend une couleur de fond différente. Le son du film est le même que celui du WAV.

Les fichiers vont dans **Recordings**, à côté du lanceur : les WAV (une heure par fichier, stéréo) et `reglages.txt` (couleur, graine et réglages au départ). Ne pas modifier les réglages ni mettre en pause pendant l'enregistrement.
