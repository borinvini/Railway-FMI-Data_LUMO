# Finnish railway delays and weather

An interactive map of Finland's long-distance train network (2018–2025). Pick a route or a station
to see how late trains typically ran there and what the weather was like along the way. Seven major
stations also have an "Ask the AI model" button: a trained model estimates the chance that a train
there is disrupted, for a month, day, time and weather you choose.

Built for an event screen and hosted as a static site: no server, no logins, no API keys.

## What's in this repo

| Folder | What it holds |
|---|---|
| `web/` | The website (Vite + React + TypeScript + Tailwind, MapLibre GL + deck.gl, Chart.js) |
| `web/public/data/` | Pre-computed JSON the site loads (generated, never edited by hand) |
| `scripts/` | Python scripts that build that JSON from the raw data |
| `data/raw/` | Station coordinates and their nearest weather stations |
| `data/derived/` | Route and station listings made by the scripts |

The raw train-and-weather files (about 2.7 GB of parquet) and the trained AI models are **not**
included, so the data scripts can't be rerun from this repo alone. The website itself builds and
runs from what is here.

## Run it locally

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in web/dist
```

## Data

- Train data: [Fintraffic / Digitraffic](https://www.digitraffic.fi/), CC BY 4.0
- Weather data: [Finnish Meteorological Institute](https://en.ilmatieteenlaitos.fi/open-data), CC BY 4.0
- Basemap: [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles, data © OpenStreetMap contributors

## Credits

Built by Vinicius Pozzobon Borin ([@borinvini](https://github.com/borinvini)) at the University of
Oulu, as part of 6G Flagship and the Interreg Aurora project, co-funded by the European Union.
