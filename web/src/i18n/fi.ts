import type { Dict } from './en'
import type { Fmt } from './format'
import { formatSnow } from '../lib/weatherFormat'

/**
 * Finnish twin of en.ts. Station names are never inflected (Finnish would say "Oulusta Helsinkiin",
 * and some station names have irregular endings), so every sentence keeps a name in its basic form:
 * "A → B", "asemalla X", "välillä A–B". Months and days use the fixed inflected forms in format.ts.
 */
export const fi = (f: Fmt): Dict => {
  const trains = (n: number) => `${f.int(n)} ${n === 1 ? 'juna' : 'junaa'}`
  const points = (n: number) => `${n} ${n === 1 ? 'prosenttiyksikkö' : 'prosenttiyksikköä'}`
  return {
    docTitle: 'Suomen kaukojunat · 2018–2025',
    loadingMap: 'Kartta latautuu…',
    lang: { label: 'Kieli', en: 'English', fi: 'Suomi' },
    allYears: 'kaikki vuodet',
    close: 'Sulje',
    flag: 'Suomen lippu',
    trains,
    min: (v) => `${f.dec(v, 1)} min`,
    pinTemp: (v) => (v === null ? '–' : f.temp(v)),
    snowOf: (v) => `lunta ${formatSnow(v)}`,

    trainType: (code) =>
      ({ IC: 'InterCity', S: 'Pendolino', AE: 'Allegro (Pietariin)', PYO: 'Yöjuna', HSM: 'Moottorivaunujuna' } as Record<string, string>)[code] ??
      'Muu kaukojuna',

    shell: {
      presentation: 'Esitystila',
      stopPresentation: 'Lopeta esitys',
      resetView: 'Palauta näkymä',
      hideWeather: 'Piilota sääasemat',
      showWeather: 'Näytä sääasemat',
    },

    summary: {
      title: 'Kaukojunat Suomessa',
      tapHint: (period) => `${period}. Napauta mitä tahansa asemaa kartalla.`,
      allYearsChip: 'Kaikki vuodet',
      yearGroup: 'Vuosi',
      trainsRan: 'junaa kulki',
      onTime: 'ajallaan (enintään 5 min myöhässä)',
      trendsLink: 'Myöhästymiset vuosien mittaan – ja sää',
    },

    finder: {
      title: 'Etsi reitti',
      clear: 'Tyhjennä reitti',
      from: 'Mistä',
      to: 'Minne',
      fromPlaceholder: 'Lähtöasema…',
      toPlaceholder: 'Määränpää…',
      swap: 'Vaihda suunta',
      random: 'Satunnainen reitti',
      play: 'Toista matka',
      stop: 'Pysäytä',
      pickTwo: 'Valitse kaksi asemaa, niin näet, mitkä junat kulkevat niiden välillä.',
      noDirect: (period) => `Näiden asemien välillä ei kulkenut suoraa junaa (${period}).`,
      direct: (period, from, to) => `Suorat junat ${from} → ${to}, ${period}`,
    },

    combobox: { placeholder: 'Valitse tai kirjoita asema…', none: 'Asemaa ei löytynyt' },

    station: {
      jump: 'Siirry asemalle',
      minutesLate: 'minuuttia myöhässä keskimäärin',
      within5: 'Perillä enintään 5 min myöhässä',
      stopping: 'Täällä pysähtyneet junat',
      routes: 'Reittejä',
      cancelled: 'Peruttu',
      aiQuestion: 'Myöhästyykö juna täällä?',
      aiIntro: 'Tekoälymalli on oppinut tämän aseman junista seitsemän vuoden ajalta. Valitse päivä ja kellonaika, niin näet sen arvion.',
      askModel: 'Kokeile tekoälyennustetta',
      weatherStation: (name, km) => `Sääasema: ${name}, ${f.dec(km, 1)} km päässä`,
      seeWeather: 'Katso sää täällä',
      weatherHere: (temp, snow) =>
        `Sää junien saapuessa: keskimäärin ${f.temp(temp)}${snow === null ? '' : snow >= 0.5 ? `, lunta ${f.dec(snow, 0)} cm` : ', ei lunta'}.`,
      badWeather: 'Myöhästymiset huonolla säällä',
    },

    conditions: {
      names: {
        hardFrost: { label: 'Kova pakkanen', detail: `−15${' '}°C tai kylmempää` },
        frost: { label: 'Pakkanen', detail: `−5${' '}°C tai kylmempää` },
        heat: { label: 'Helle', detail: `yli 25${' '}°C` },
        precip: { label: 'Sadetta (vettä tai lunta)', detail: 'mikä tahansa sade' },
        gust: { label: 'Voimakkaat tuulenpuuskat', detail: 'yli 16 m/s' },
        deepSnow: { label: 'Paksu lumipeite', detail: 'maassa vähintään 25 cm' },
      },
      counts: (n, latePct) => ` · ${f.int(n)} saapumista, ${f.pct(latePct, 0)} myöhässä`,
      yearsAbove: (a, b) => ` · tavallista enemmän ${a}/${b} vuotena`,
      aria: (signed) => `${signed} myöhästynyttä junaa enemmän sataa kohden`,
      key: 'Ylimääräiset myöhästyneet junat sataa kohden (yli 5 min myöhässä) verrattuna samaan asemaan, kuukauteen ja vuorokaudenaikaan.',
      caveat: 'Luvut kertovat, mitä tapahtui, eivät tarkalleen miksi: huonon sään mukana tulee muutakin, kuten talven pimeys.',
    },

    legend: {
      station: 'Keskimääräinen myöhästyminen asemalla',
      onTime: 'ajallaan',
      late8: '8+ min myöhässä',
      stop: 'Keskimääräinen myöhästyminen tällä pysäkillä',
      badges: ['Alle 2 min myöhässä', '2–5 min myöhässä', 'Yli 5 min myöhässä'],
      noFigure: 'Ei lukua',
      weatherStation: 'Sääasema',
      temperature: 'Lämpötila',
      snowDepth: 'Lumensyvyys',
      whenThere: 'Kun tämän reitin junat olivat siellä',
      ai: 'Tekoälyennuste tällä asemalla',
      pill: 'Selite',
      pillHide: 'Piilota',
      show: 'Näytä selite',
      hide: 'Piilota selite',
    },

    map: {
      routeClick: 'Napsauta: reitin tiedot',
      // "AI" is used in Finnish too ("AI-malli"); "TA" would not be understood.
      aiTag: 'AI',
      aiHint: 'Tekoälyennuste: avaa asema ja kokeile',
      compass: 'Kierrä karttaa vetämällä, palauta pohjoinen ylös napsauttamalla',
      noSnowFigure: 'lumensyvyys ei tiedossa',
      stationPin: (name, km, temp, snow) =>
        `Sääasema ${name}\n${f.dec(km, 1)} km päässä\nKeskiarvo junien aikaan: ${temp}, ${snow}\nNapsauta: sää`,
      routePin: (name, own, temp, snow, serves) =>
        `Sääasema ${name}\n${
          own ? `keskimäärin ${temp}, ${snow},\nkun tämän reitin junat olivat siellä` : `Lähiasemien keskiarvo: ${temp}, ${snow}\n(ei lukua tämän reitin omista junista)`
        }\nPalvelee asemia: ${serves.join(', ')}\nNapsauta: sää`,
      badgeNone: (name) => `${name}\nAsemalle ei ole tallennettua lukua`,
      badgeOwn: (name, v) => `${name}\n${f.dec(v, 1)} min myöhässä tällä reitillä`,
      badgeFallback: (name, v) => `${name}\n${f.dec(v, 1)} min myöhässä (aseman keskiarvo:\nei lukua tämän reitin omista junista)`,
      station: (name, v) => `${name}\nkeskimäärin ${f.dec(v, 1)} min myöhässä`,
    },

    charts: {
      minutesLate: 'Minuuttia myöhässä',
      noTrains: 'Ei junia',
      lateAvg: (v) => `keskimäärin ${f.dec(v, 1)} min myöhässä`,
    },

    route: {
      routeOf: (i, n) => `Reitti ${i}/${n}: `,
      tab: (i, label, n) => `Reitti ${i}: ${label}, ${trains(n)}`,
      direct: 'suora',
      // "via" as on Finnish timetables: "kautta" would need the names in the genitive.
      via: (names) => `via ${names.join(', ')}`,
      stops: (n) => ` (${n} ${n === 1 ? 'pysäkki' : 'pysäkkiä'})`,
      pickOne: (n) => `Junat kulkevat ${n} eri reittiä. Valitse yksi:`,
      tabsAria: 'Reitit näiden asemien välillä',
      loading: 'Ladataan tilastoja…',
      failed: 'Tilastoja ei voitu ladata. Yritä uudelleen.',
      tileTrains: (period) => `Junia, ${period}`,
      tileLate: 'Tyypillinen myöhästyminen pysäkeillä',
      tileOnTime: 'Ajallaan (enintään 5 min myöhässä)',
      tileCancelled: 'Peruttu',
      stopsTitle: 'Myöhästyminen pysäkeittäin',
      stopsIntro: (from, to) => `Tyypillinen myöhästyminen minuutteina junien saapuessa pysäkeille, reitillä ${from} → ${to}.`,
      stopsShown: (x, y) => `Näytetään ${x}/${y} pysäkkiä: muilta ei ole tallennettuja lukuja, koska nämä junat kulkevat yleensä toista reittiä.`,
      insightJump: (from, to, by) => `Myöhästyminen kasvaa eniten välillä ${from}–${to} (+${f.dec(by, 1)} min).`,
      insightLatest: (name, avg) => `Eniten myöhässä: ${name}, keskimäärin ${f.dec(avg, 1)} min.`,
      stopNumbers: 'Näytä luvut pysäkeittäin',
      colStop: 'Pysäkki',
      colLate: 'Tyypillisesti myöhässä',
      colTrains: 'Junia',
      runTitle: 'Miten junat kulkivat',
      runIntro: 'Junien osuus sen mukaan, kuinka paljon ne olivat keskimäärin myöhässä matkan varrella.',
      onTime: 'Ajallaan (enintään 5 min myöhässä)',
      bitLate: 'Hieman myöhässä (5–15 min)',
      veryLate: 'Paljon myöhässä (yli 15 min)',
      noArrivals: 'Ei saapumistietoja.',
      overTitle: 'Vuosien mittaan',
      overIntro: (year) => `Tämän reitin junien tyypillinen myöhästyminen kuukausittain${year !== null ? `; vuosi ${year} on korostettu` : ''}.`,
      overAria: 'Viivakaavio tämän reitin tyypillisestä myöhästymisestä kuukausittain',
      seasonIntro: (year) => (year === null ? 'Ja vuoden kierto, kaikki vuodet yhdessä.' : `Ja vuosi ${year} kuukausittain.`),
      seasonAria: 'Pylväskaavio tämän reitin tyypillisestä myöhästymisestä kalenterikuukausittain',
      weatherTitle: 'Myöhästyminen ja sää',
      weatherNone: (period) => `Huonoa säätä ei ollut tällä reitillä tarpeeksi usein vertailuun (${period}).`,
      weatherIntro: 'Kuinka monta tämän reitin junaa tavallista useammin oli yli 5 minuuttia myöhässä kussakin säässä.',
      weatherSource: 'Säätiedot ovat lähimmältä sääasemalta.',
      servicesTitle: 'Junayhteydet tällä reitillä',
      colTrain: 'Juna',
      colJourney: 'Matka',
      colOnTime: 'Ajallaan',
      moreNumbers: 'Lisää lukuja',
      colWorst: 'Huonoin 10 % matkoista myöhässä',
      colCancelled: 'Peruttu',
      footnote: (period) =>
        `${period}. Pääluvut ja taulukko kattavat tätä reittiä kulkevien junien koko matkat, jotka voivat alkaa ennen reittiä tai jatkua sen jälkeen; pysäkkikohtaiset luvut perustuvat kunkin pysäkin omiin saapumisiin.`,
      missing: (n) => ` ${n} junayhteydellä ei ole tallennettuja tilastoja.`,
      stopTip: (avg, n) => `${f.dec(avg, 1)} min myöhässä · ${trains(n)}`,
      stopAria: 'Pylväskaavio tyypillisestä myöhästymisestä reitin pysäkeillä',
    },

    trends: {
      title: 'Myöhästymiset vuosien mittaan',
      intro: (period, year) => `Kaikki kaukojunat, ${period}.${year !== null ? ` Vuosi ${year} on korostettu alla.` : ''}`,
      monthTitle: 'Kuukausittain',
      monthIntro: 'Tyypillinen myöhästyminen minuutteina junien saapuessa, kuukausittain.',
      monthAria: 'Viivakaavio tyypillisestä myöhästymisestä kuukausittain',
      seasonTitle: 'Vuoden kierto',
      seasonIntro: (year) => (year === null ? 'Sama kalenterikuukausittain, kaikki vuodet yhdessä.' : `Sama vuoden ${year} kuukausille.`),
      seasonAria: (year) => `Pylväskaavio tyypillisestä myöhästymisestä kalenterikuukausittain${year === null ? '' : `, vuosi ${year}`}`,
      seasonLine: (year, worst, worstV, best, bestV) =>
        `${year === null ? 'Junat olivat' : `Vuonna ${year} junat olivat`} eniten myöhässä ${f.monthIn[worst]} (keskimäärin ${f.dec(worstV, 1)} min) ja vähiten ${f.monthIn[best]} (${f.dec(bestV, 1)} min).`,
      yearLine: (worst, worstV, best, bestV) =>
        `Vuonna ${worst} myöhästyttiin eniten (keskimäärin ${f.dec(worstV, 1)} min), vuonna ${best} vähiten (${f.dec(bestV, 1)} min).`,
      fewestLine: (month, pct) =>
        `Vähiten junia kulki ${f.monthIn[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}: ${f.pct(pct, 0)} tavallisesta kuukaudesta.`,
      badWeather: 'Myöhästymiset huonolla säällä',
      footnote: (arrivals) =>
        `Myöhästyminen on saapumisen myöhästyminen minuutteina (etuajassa saapuminen lasketaan nollaksi), keskiarvo ${f.int(arrivals)} saapumisesta.`,
    },

    weather: {
      title: (name) => `Sääasema ${name}`,
      intro: (km, station, period) => `${f.dec(km, 1)} km päässä asemalta ${station}. ${period}, silloin kun junia oli lähellä.`,
      routeNote: (temp, snow) =>
        `Tämän reitin junien aikaan: keskimäärin ${temp === null ? '–' : f.temp(temp)}${snow === null ? '' : `, lunta ${formatSnow(snow)}`}.`,
      closer: (name, km) =>
        `Lähemmällä asemalla ${name}${km !== null ? ` (${f.dec(km, 1)} km)` : ''} ei ole lukemia junien ajoilta, joten käytetään tätä.`,
      loading: 'Ladataan säätietoja…',
      failed: 'Säätietoja ei voitu ladata. Yritä uudelleen.',
      none: (period) => `Tällä sääasemalla ei ole lukemia junien ajoilta${period === null ? '' : ` ajalta ${period}`}.`,
      tooFew: (period, n) => `Liian vähän lukemia yhteenvetoon (${period}): yhteensä ${f.int(n)}.`,
      avgTemp: 'Keskilämpötila',
      coldest: 'Kylmin',
      warmest: 'Lämpimin',
      deepestSnow: 'Paksuin lumipeite',
      strongestGust: 'Voimakkain tuulenpuuska',
      worstVisibility: 'Huonoin näkyvyys',
      noReading: 'Ei lukemaa',
      noSnow: 'Ei lunta',
      tabs: { temp: 'Lämpötila', snow: 'Lumi', wind: 'Tuuli' },
      tabsAria: 'Sää kuukausittain',
      tempIntro: 'Kukin palkki ulottuu kuukauden kylmimmästä lämpimimpään lukemaan. Kuukausina ilman palkkia ei ollut lukemia.',
      tempAxis: 'Ilman lämpötila (°C)',
      tempAria: 'Pylväskaavio kuukauden alimmasta ja ylimmästä lämpötilalukemasta',
      tempTip: (low, avg, high) => `${f.temp(low)} … ${f.temp(high)}, keskiarvo ${f.temp(avg)}`,
      noReadings: 'Ei lukemia',
      snowIntro: (daysWithSnow, days) =>
        `Kunkin kuukauden suurin mitattu lumensyvyys.${
          daysWithSnow > 0
            ? ` Maassa oli lunta ${f.int(daysWithSnow)} päivänä ${f.int(days)} mittauspäivästä.`
            : ' Maassa ei ollut lunta yhdelläkään lukemalla.'
        }`,
      snowAxis: 'Lumensyvyys (cm)',
      snowAria: 'Pylväskaavio kunkin kuukauden suurimmasta lumensyvyydestä',
      snowTip: (cm) => `lunta ${f.dec(cm, 0)} cm`,
      windIntro: `Kunkin kuukauden voimakkain mitattu tuulenpuuska metreinä sekunnissa (1 m/s on ${f.dec(3.6, 1)} km/h).`,
      windAxis: 'Voimakkain puuska (m/s)',
      windAria: 'Pylväskaavio kunkin kuukauden voimakkaimmasta tuulenpuuskasta',
      windTip: (ms) => `${f.dec(ms, 0)} m/s (${f.dec(ms * 3.6, 0)} km/h)`,
      footnote: (readings, slotPct, period) =>
        `Perustuu ${f.int(readings)} lukemaan${slotPct !== null ? ` (${f.pct(slotPct, 0)} ajanjakson ${period} 10 minuutin jaksoista)` : ''}, jotka on otettu junien ollessa lähellä. Ääriarvot ovat näiltä hetkiltä, joten kylmä yö ilman junia ei näy niissä. Jos asema ei mittaa jotakin, tieto otetaan seuraavaksi lähimmältä asemalta.`,
    },

    predictor: {
      title: (station) => `Tekoälyennuste: ${station}`,
      intro: (period) =>
        `Malli on oppinut täällä vuosina ${period} pysähtyneistä junista ja niiden säästä. Valitse kuukausi, päivä ja kellonaika, niin näet, kuinka todennäköisesti juna on myöhässä tai peruttu.`,
      loading: 'Ladataan mallia…',
      failed: 'Mallia ei voitu ladata. Yritä uudelleen.',
      noModel: 'Tälle asemalle ei ole mallia.',
      month: 'Kuukausi',
      day: 'Päivä',
      dayAria: 'Viikonpäivä',
      time: 'Aika',
      timeAria: 'Kellonaika',
      weather: 'Sää',
      noWeather: 'Tämän aseman malli ei käytä säätietoja.',
      chance: 'todennäköisyys, että juna on täällä myöhässä (vähintään 1 min) tai peruttu',
      change: (chance, usual) => {
        const d = Math.round(chance - usual)
        const u = f.pct(Math.round(usual), 0)
        if (d === 0) return `Suunnilleen sama kuin täällä tavallisesti (${u})`
        return `${points(Math.abs(d))} tavallista ${d > 0 ? 'korkeampi' : 'matalampi'} (${u})`
      },
      effect: (effect) => {
        const n = Math.round(Math.abs(effect))
        return Math.abs(effect) < 1 ? 'valitsemasi sää tuskin muuttaa sitä' : `valitsemasi sää ${effect > 0 ? 'nostaa' : 'laskee'} sitä ${points(n)}`
      },
      rough: 'Karkea arvio: tuolloin täällä pysähtyi vain vähän junia tai ei yhtään.',
      footnote: (o) =>
        `${
          o.few
            ? `Tekoälymallin vastaus tyypilliselle junalle asemalla ${o.station} tuohon aikaan`
            : `Tekoälymallin keskimääräinen vastaus junille, jotka pysähtyivät asemalla ${o.station} vuosina ${o.period} ${f.dayPlural[o.day]} ${f.monthIn[o.month]} noin klo ${o.time}`
        }${
          o.weather === 'picked'
            ? ', valitsemallasi säällä (myös kolmen edellisen päivän lämpötilat muuttuvat sen mukana).'
            : o.weather === 'real'
              ? ', niiden todellisella säällä.'
              : '.'
        } Malli tietää ${o.knows} ja erottaa myöhässä olevan junan ajallaan olevasta noin ${o.auc} kertaa kymmenestä. Arvio perustuu menneisiin säännönmukaisuuksiin, se ei ole aikataulu.`,
      knows: {
        S1: 'vain kellonajan, viikonpäivän ja kuukauden (ei säätä)',
        S5: 'kellonajan, viikonpäivän, kuukauden ja kolmen edellisen päivän sään',
        S11: 'kellonajan, viikonpäivän, kuukauden, kolmen edellisen päivän sään ja sään tyypin (sade, lumi, sumu…)',
      },
      tempAria: 'Ilman lämpötila',
      snowAria: 'Lumensyvyys',
      snowValue: (cm) => `lunta ${cm} cm`,
      noSnowMonth: (month) => `Ei lunta maassa ${f.monthIn[month]}`,
      rangeNote: (picked, low, high, snowMax, month) =>
        `${picked ? 'Valitsemasi sää' : 'Nyt: kunkin junan todellinen sää. Valitse oma sää liukusäätimellä'} (${f.temp(low)} … ${f.temp(high)}${
          snowMax !== null ? `, lunta 0–${snowMax} cm` : ''
        }, kuten ${f.monthIn[month]} on havaittu).`,
      useReal: 'Käytä todellista säätä',
      dayStrip: (usual) =>
        `Päivän mittaan (valitse aika napauttamalla palkkia). Haaleat palkit: vähän tai ei junia. Katkoviiva: tavallinen ${f.pct(Math.round(usual), 0)}.`,
    },

    live: {
      typical: 'Tyypillinen matka keskiarvoista koottuna',
      ready: 'Valmistaudutaan…',
      lateAvg: (v) => `keskimäärin ${f.dec(v, 1)} min myöhässä`,
      stop: 'Pysäytä',
      progress: (a, b) => `Pysäkki ${a}/${b}`,
      delayTitle: 'Keskimääräinen myöhästyminen asemittain',
      delayAria: 'Viivakaavio keskimääräisestä myöhästymisestä reitin asemilla, piirtyy junan edetessä',
      weatherTitle: 'Lämpötila ja lumi matkan varrella',
      weatherAria: 'Kaavio lämpötilasta ja lumensyvyydestä reitillä, piirtyy junan edetessä',
      temperature: 'Lämpötila',
      snowDepth: 'Lumensyvyys',
      tabDelay: 'Myöhästyminen',
      tabWeather: 'Sää',
      tabsAria: 'Kaavio',
    },

    phone: {
      title: 'Junat Suomessa',
      periodAria: (p) => `Näytetty jakso: ${p}. Vaihda se Yhteenvedossa`,
      dockAria: 'Paneelit',
      route: 'Reitti',
      station: 'Asema',
      overview: 'Yhteenveto',
      sheetRoute: 'Etsi reitti',
      sheetStation: 'Asema',
      sheetOverview: 'Yhteenveto',
      hideSheet: (label) => `Sulje: ${label}`,
      showFinder: 'Näytä reittihaku',
      details: (paths) => (paths > 1 ? `Tiedot (${paths} reittiä)` : 'Tiedot'),
    },

    footer: {
      builtBy: 'Tekijä:',
      about: 'Tietoa',
      aboutLong: 'Tietoa sivustosta',
    },

    about: {
      title: 'Tietoa sivustosta',
      intro:
        'Sivusto avaa ikkunan FI-TW-aineistoon. Se on avoin aineisto, joka yhdistää Suomen kaukoliikenteen junat lähimmän sääaseman havaintoihin. Aineisto on julkaistu Open Research Europe -lehdessä, ja artikkeli kuvaa sen kokonaan.',
      paperLabel: 'Artikkeli',
      readPaper: 'Lue artikkeli',
      authorLead: 'Tekijä:',
      author:
        'osana väitöskirjatutkimusta Oulun yliopiston Centre for Wireless Communications -yksikössä (CWC).',
      profile: 'Tutkijaprofiili',
      fundingTitle: 'Rahoitus',
      funding:
        'Tutkimusta ovat osittain tukeneet Suomessa ja Ruotsissa Euroopan unioni Interreg Aurora -hankkeen ENSURE-6G kautta (rahoituspäätös 20361812) sekä Suomessa Suomen Akatemia 6G Flagship -hankkeen kautta (rahoituspäätös 369116).',
      dataTitle: 'Aineisto',
      data: 'Junat: Fintraffic (Digitraffic). Sää: Ilmatieteen laitos. Molemmat CC BY 4.0 -lisenssillä.',
      partnersTitle: 'Kumppanit',
      uoulu: 'Oulun yliopisto',
      uouluHref: 'https://www.oulu.fi/fi',
      interreg: 'Interreg Aurora, Euroopan unionin osarahoittama',
      oulu2026: 'Oulu2026, Euroopan kulttuuripääkaupunki',
      oulu2026Href: 'https://oulu2026.eu/',
    },
  }
}
