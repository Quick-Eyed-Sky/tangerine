# Samples de Tangerine II

Les samples restent sur ton Mac. Ils ne vont pas sur GitHub, car la plupart des licences de samples n'autorisent pas le partage.

## Où les mettre

Le lanceur cherche les samples à deux endroits, dans cet ordre :

1. le dossier `samples/` à côté de Tangerine ;
2. le dossier `SAMPLES` à côté du dossier de Tangerine, par exemple `Tangerine II/SAMPLES` avec `Tangerine II/Tangerine`.

Tu peux ranger tes packs tels que tu les as téléchargés.

## Comment Tangerine les trouve

- **`instruments.json`** (à côté du lanceur) donne un nom à chaque instrument et dit où il se trouve. Il y a trois façons de décrire un instrument :
  - `folder` : un dossier avec une note par fichier, comme les Mellotron de Sonic Bloom ;
  - `files` : un ou plusieurs fichiers, comme les packs Legowelt (un son par fichier) ;
  - `sfz` : un fichier SFZ déjà réglé, comme la bibliothèque Fairlight Series III.
- **Changer un son** : il suffit de remplacer un nom de fichier dans `instruments.json`, puis de recharger la page.
- **Volume d'un instrument** : `"gain": 1.5` le rend plus fort, `0.7` plus doux.
- **La hauteur des notes** : un nom de note dans le nom du fichier (`Choir C3.wav`) fixe sa hauteur. Sinon, Tangerine la mesure à l'écoute.
- **Les réverbérations** : un dossier `_spaces/` dans le dossier des samples reçoit les vraies réverbérations (fichiers WAV de réponse impulsionnelle). Les noms reconnus par les couleurs sont `church`, `cathedral`, `hall`, `plate`, `room` et `studio`.
- **Chargement à la demande** : un instrument n'est chargé que lorsqu'une couleur ou une couche le demande. Les premières secondes, la couche peut encore jouer en synthèse.
