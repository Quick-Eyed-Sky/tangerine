# Tangerine — mode d'emploi

Version 1.2.0, 24 octobre 2026. La petite sœur électrique de Loopra : une liane sans fin de séquences et d'harmonies lentes, dans l'esprit de la musique à séquenceurs des années 70. Pas de batterie : les accents des séquences font le rythme.

Les règles musicales sont expliquées dans le document « Tangerine — grammaire des séquences et des modulations » (dans le projet Claude).

## Lancer

Double-clic sur **`Tangerine.command`**. Chrome s'ouvre sur `http://127.0.0.1:4250` (Loopra garde ses propres ports). Garder la fenêtre du Terminal ouverte pendant l'écoute. Barre d'espace : lecture / pause. La flèche ronde à côté de *Pause* (**Restart**) repart de zéro avec une nouvelle graine, une nouvelle tonalité, un nouveau mode et de nouveaux réglages d'harmonie ; les couches, leurs sons et le tempo restent. Le bouton dans le coin de la liane (ou un double-clic dessus) la met en **plein écran**, avec l'accord en grand ; Échap pour sortir, la barre d'espace marche toujours.

## Ce qu'on règle

Chaque curseur a sa ligne d'explication dans l'appli. En bref :

| Réglage | Ce qu'il fait |
| --- | --- |
| **Tempo** | 60 à 140 BPM. Tout suit : séquences, échos, MIDI enregistré. |
| **La forme** | *Endless* : ne s'arrête jamais, comme Loopra. *A thread of N min* (de 3 minutes à 2 heures) : un fil qui part du début, rentre à la maison 24 mesures avant la fin, garde l'accord de tonique pendant les 8 dernières mesures pendant que les couches partent une à une, puis la nappe s'éteint. Le fil est gardé en entier automatiquement à la fin. *Make the thread as files* fabrique le même fil hors-ligne et donne WAV, MIDI et ABC. Au-delà de 20 minutes, le son serait trop lourd pour la mémoire du navigateur : à la fin du fil, Tangerine garde les 20 dernières minutes en son, et le bouton devient *Make the thread as notes* (MIDI et ABC du fil entier, en quelques secondes). *Record from now* s'arrête de lui-même à 30 minutes et garde la prise. |
| **Key, Mode** | Où vit la liane. Les changer pendant la lecture : elle y va par le chemin le plus doux (accord pivot ou note commune). |
| **Random** | Tire une tonalité, un mode et les quatre réglages d'harmonie, et affiche ce qu'il a tiré. |
| **Harmonic richness** | La couleur de chaque accord : quintes et accords suspendus → triades → septièmes et 6/9 → neuvièmes et onzièmes. Ne change pas la tonalité. |
| **Key changes** | Combien de fois la tonalité et le mode changent : par tranche de 10 minutes, ou dans tout le fil (plus le retour à la maison). À 0, on ne bouge pas. |
| **Distance** | Jusqu'où va chaque changement : un autre mode sur les mêmes notes, le relatif, la quinte… jusqu'aux médiantes chromatiques. |
| **Held bass** | Combien de fois la basse garde la note de la maison (pédale) pendant que les accords bougent. À 0 (par défaut), elle suit l'harmonie. |
| **Evolution** | Toutes les quelques dizaines de passages, une séquence change un détail (note, octave, accent). Jamais deux à la fois. 70 = l'ancien maximum. |
| **New sequences** | Le bouton redessine toutes les séquences (et le thème de la mélodie lente), l'harmonie reste. *By themselves* : toutes les 32 mesures par défaut (ou 64, 128, ou jamais), sur un changement d'accord. |
| **Slow change** | Longueur des notes, échos, brillance, niveaux, richesse, distance et basse tenue dérivent lentement autour de leurs réglages, chacun sur sa vague de quelques minutes (à 80 BPM, 4 à 20 minutes par aller-retour). |
| **Sounds change** | *Now and then* (par défaut) : environ toutes les 64 mesures, une couche prend une autre de ses variantes de son, sur un changement d'accord ; sa carte l'affiche. *Often* : toutes les 32 mesures environ. *Never* : chaque couche garde son son. |
| **Layers change** | *Now and then* (par défaut) : environ toutes les 32 mesures, sur un changement d'accord, une couche se repose et une autre entre (en fondu). Le nombre de couches allumées reste le même : c'est toi qui le choisis en allumant ou éteignant des couches (« 9 of 12 keep playing »). Toutes y passent, la basse comprise : des respirations. *Often* : toutes les 16 mesures environ. *Never* : les couches restent comme tu les as mises. |
| **Reverb · dry–wet, Room size** | La réverbération : quelle part de chaque couche part dans la salle (les couches proches restent plus sèches), et la taille de la salle. |
| **Motion** | Le son respire : filtres, accord, niveau. Les notes ne changent pas. 70 = l'ancien maximum. |

## Les douze couches

| Couche | Ce qu'elle joue | Par défaut |
| --- | --- | --- |
| **Bass sequence** | La séquence de basse, 16 doubles croches (son Moog adouci, gate 27 %). | allumée |
| **Arpeggio** | L'arpège, 12 pas. | allumée |
| **High motif** | Le motif aigu, 7 croches. | allumée |
| **Pad** | La nappe : les notes communes ne sont pas rejouées. | allumée |
| **Bells** | Six cloches, chacune à sa période. | allumée |
| **Low strings** | Un violoncelle à l'archet, grave : une note de l'accord par accord, une deuxième au milieu des accords longs. | allumée |
| **Counter sequence** | Une contre-séquence en croches pointées, grave-aigu en alternance : elle tourne à une autre vitesse que la basse (deux séquenceurs qui ne vont pas au même pas). | allumée |
| **Long lead** | Des notes longues et des silences, sur un long écho d'une mesure (façon « boucle de bande » à la Fripp ou Pinhas). | allumée |
| **Drone** | Le bourdon sur la note de la maison (et sa quinte), seulement quand il ne frotte pas avec l'accord. | éteinte |
| **High strings** | Des violons aigus, une octave au-dessus des deux notes du haut de la nappe. | éteinte |
| **Slow melody** | Un thème court de 4 à 6 notes (flûte de bande façon Mellotron), chanté puis suivi de 2 à 8 mesures de silence, et qui revient, parfois avec une note changée. Il suit les accords. | allumée |
| **Echo pulse** | Une note par noire, presque toujours jouée, que l'écho en croche pointée remplit : la pulsation qui ricoche. 5 noires par défaut (3 à 9). | éteinte |

Sur chaque carte : **ON/OFF**, le **casque** (écouter cette couche seule, même éteinte ; re-cliquer ou *Return to the mix* pour revenir), le son, le niveau, et sous *Shape & echo* : attaque, déclin, maintien, relâchement, *gate*, écho au tempo (durée, répétitions, niveau). Les répétitions d'écho s'éteignent toujours, même à 100 % : la boucle perd un peu à chaque passage et sature doucement, comme une bande.

## Garder ce qu'on vient d'entendre

Tangerine se souvient en permanence des **20 dernières minutes**. Un passage t'a plu ? Choisis *The last 30 seconds* … *The last 20 minutes* ou *Since the start*, puis **Keep**. Ou *Record from now* puis *Stop and keep*.

Chaque passage donne quatre fichiers, à télécharger sous le bouton :

- **WAV** : le son, 48 kHz, 16 bits, stéréo (ce que tu entends, solo compris).
- **MIDI** : une piste par couche allumée, pile sur la grille, avec le tempo. Canaux : basse 1, arpège 2, motif 3, nappe 4, cloches 5, violoncelle 6, contre-séquence 7, lead 8, bourdon 9, violons 11, mélodie lente 12, echo pulse 13 (le 10 est réservé aux percussions en General MIDI). Les notes tenues (nappe, bourdon, violons) le restent d'un accord à l'autre.
- **ABC** : la partition en texte, une voix par couche qui a joué, avec l'armure de chaque tonalité traversée.
- **LEAD** : une partition ABC réduite, la mélodie (le motif aigu, ou l'arpège) avec les noms d'accords. C'est le format que YuE2 sait lire comme plan (`--abc-file chemin.abc --cot full`, avec un style et des paroles). Garder alors un passage court : YuE2 plafonne vers 4 000 jetons de partition, soit quelques minutes.

ACE-Step ne lit pas l'ABC. Il peut en revanche retravailler le **WAV** (cover, repaint, prolonger).

## MIDI en direct

*MIDI out* envoie les notes des couches allumées à un autre logiciel ou synthé (Chrome demande l'autorisation). *MIDI only* coupe les sons de Tangerine : elle devient un séquenceur silencieux.

## Réglages enregistrés

*Save setup* garde tout dans un petit fichier JSON ; *Load setup* le relit. Les réglages des versions précédentes sont repris et convertis (Journeys devient Key changes + Distance, Evolution et Motion passent à la nouvelle échelle, les nouvelles couches prennent leurs valeurs par défaut ; depuis la 1.2, *New sequences* passe à 32 mesures et *Layers change* à *Now and then*).

## Pour moi (technique)

- Aucune dépendance. `dist/` contient l'appli ; `npm test` lance les tests (moteur, MIDI, ABC) ; `node tools/render.mjs --minutes 3 --seed 42 --out tools/renders/essai` fabrique un fil hors-ligne avec Chromium.
- La même graine (seed) et les mêmes réglages donnent toujours la même liane, dérive lente comprise.
