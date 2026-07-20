# Third-party notices

## gifenc animation encoder

The weather-animation export worker uses `gifenc` to quantize loaded weather
frames and encode animated GIF files in the browser. `gifenc` is distributed
under the MIT License.

- Source: https://github.com/mattdesl/gifenc
- License: https://github.com/mattdesl/gifenc/blob/master/LICENSE.md

## Mediabunny MP4 encoder and muxer

The weather-animation MP4 export dynamically loads `mediabunny` to encode
canvas frames with the browser WebCodecs H.264 encoder and mux them into an MP4
container using explicit per-frame timestamps. `mediabunny` is distributed
under the Mozilla Public License 2.0.

- Source: https://github.com/Vanilagy/mediabunny
- License: https://github.com/Vanilagy/mediabunny/blob/main/LICENSE

## SheetJS spreadsheet parser

The CENC server adapter uses the `xlsx` package to parse the official
ground-motion report export, including its published station latitude and
longitude columns. `xlsx` 0.18.5 is distributed under the Apache License 2.0.

- Source: https://github.com/SheetJS/sheetjs
- License: https://github.com/SheetJS/sheetjs/blob/v0.18.5/LICENSE

## USGS earthquake-eventpages beachball renderer

Files under `src/vendor/usgs-beachball/` originate from the United States
Geological Survey `earthquake-eventpages` project. USGS states that the work is
public domain in the United States and dedicates related rights worldwide under
CC0 1.0. The renderer is used to visualize official USGS moment-tensor and
focal-mechanism products. No endorsement by USGS is implied.

- Source: https://github.com/usgs/earthquake-eventpages
- License: https://github.com/usgs/earthquake-eventpages/blob/main/LICENSE.md

## NIED station metadata

`data/seismic/nied-site-pub.json` is derived from public NIED K-NET/KiK-net
station metadata exposed by the reference implementation in
`/Users/a1/kanameishi-keshiEew`. Runtime station ordering and current discrete
intensity values are requested from the public NIED Strong-motion Monitor data
path. This private research dashboard preserves the NIED terms link and labels
the values as experimental redistribution. It must not be treated as an
official warning channel.

- NIED Strong-motion Monitor: https://www.kyoshin.bosai.go.jp/
- Usage notes: https://www.kyoshin.bosai.go.jp/ja/about_kmoni/
- Station list: https://www.kyoshin.bosai.go.jp/ja/stationlist/

## GEM Global Active Faults Database

`public/data/global-active-faults.geo.json` is a mechanically simplified and
activity-classified derivative of the GEM Foundation Global Active Faults
Database (GAF-DB). The source traces are grouped by the published
`last_movement` field: historical/recent (red), Holocene (orange), late
Quaternary (yellow), and older or unknown age (green). This visualization is a
tectonic reference layer, not a real-time rupture forecast and not proof that
an unmarked location has no fault.

The GEM GAF-DB is licensed under CC BY-SA 4.0. The derivative retains source
and license metadata in the GeoJSON file.

- Source: https://github.com/GEMScienceTools/gem-global-active-faults
- Publication: https://doi.org/10.1177/8755293020944182
- License: https://creativecommons.org/licenses/by-sa/4.0/

## J-SHIS official API products

`server/jshis.mjs` requests the public J-SHIS Web API operated by Japan's
National Research Institute for Earth Science and Disaster Resilience (NIED).
The application keeps the probabilistic seismic-hazard mesh, shallow subsurface
structure, earthquake-induced landslide containment result, fault contribution
ranking, and selected fault geometry as distinct products. Long-term hazard
probabilities and site conditions are not labelled as real-time earthquake
observations or warnings. No J-SHIS dataset is bundled or rehosted.

- J-SHIS Web API: https://www.j-shis.bosai.go.jp/en/api-list
- J-SHIS Map: https://www.j-shis.bosai.go.jp/map/
- Terms of use: https://www.j-shis.bosai.go.jp/en/terms

## Authorized Early-est and GlobalQuake warning adapters

`server/externalWarnings.mjs` accepts an operator-provided, authorized JSON or
CAP feed for INGV Early-est and GlobalQuake. No private protocol, proprietary
client code, credentials, or warning dataset from either project is bundled.
The adapters stay disabled and are reported as unconfigured until an authorized
feed URL is supplied. Bearer tokens remain server-side.

- INGV Early-est: https://early-est.rm.ingv.it/
- GlobalQuake: https://globalquake.net/

## East Asia administrative boundaries

The application loads simplified province-level boundaries from `cn-atlas`
for mainland China, Hong Kong, and Macao, and county/city boundaries from
`taiwan-atlas` for Taiwan. These files are distributed as separate map assets
and are used only for local or official intensity-area visualization.

`cn-atlas` is an ISC-licensed redistribution derived from the 2023
`ruiduobao/shengshixian.com` administrative-boundary dataset. `taiwan-atlas`
is MIT licensed and derives its county/city topology from the Taiwan Ministry
of the Interior open-data boundary dataset.

- China atlas: https://github.com/BarbarossaWang/cn-atlas
- China source chain: https://github.com/ruiduobao/shengshixian.com
- Taiwan atlas: https://github.com/dkaoster/taiwan-atlas
- Taiwan county/city source: https://data.gov.tw/dataset/7442

## Reference applications

Architecture and protocol behavior were studied from these local AGPL-3.0
reference applications. This dashboard uses an independently implemented
client data model and deterministic travel-time solver; attribution is retained
for provenance.

- `/Users/a1/kanameishi-keshiEew`
- `/Users/a1/Keshi-MockEew-dev`

### GlobalQuake and CAPQuake protocol study

The FDSN station-catalogue plus miniSEED waveform workflow was designed after
studying the public GlobalQuake architecture. The implementation in this
dashboard uses current official HTTPS FDSN endpoints and does not copy the old
hard-coded service list. GlobalQuake's public source is MIT-licensed.

CAPQuake was audited for public adapters and source provenance. Its public
repository is BSD-3-Clause licensed, but several advertised modules are empty
shells or depend on third-party relays. Only independently verified official
interfaces are enabled here; unavailable or private relay sources are not
represented as connected.

- GlobalQuake source (MIT): https://github.com/xspanger3770/GlobalQuake
- CAPQuake source (BSD-3-Clause): https://github.com/CelestialAsPeak/CAPQuake

## FDSN station metadata and miniSEED waveforms

`server/fdsn.mjs` queries public FDSN Station and Dataselect web services from
EarthScope, GFZ GEOFON, ORFEUS EIDA, GeoNet and BMKG. The client decodes the
returned miniSEED with `seisplotjs` (MIT) and renders raw sample-count snapshots.
It does not synthesize waveforms from magnitude or intensity. EarthScope states
that Dataselect must not be polled as a continuous-data service, so this private
dashboard loads a bounded snapshot only after explicit station selection and
performs scrolling/replay locally.

BMKG data remains attributed to BMKG in both the event catalogue and station
provider status. Consumers must observe the upstream service's published rate
limit and attribution requirements.

- FDSN web-service specifications: https://www.fdsn.org/webservices/
- EarthScope Station: https://service.earthscope.org/fdsnws/station/1/
- EarthScope Dataselect: https://service.earthscope.org/fdsnws/dataselect/1/
- GFZ GEOFON: https://geofon.gfz.de/waveform/
- ORFEUS EIDA: https://www.orfeus-eu.org/data/eida/webservices/
- GeoNet seismic waves: https://www.geonet.org.nz/data/types/seismic_waves
- BMKG Open Data: https://data.bmkg.go.id/gempabumi/
- seisplotjs source (MIT): https://github.com/crotwell/seisplotjs

## Japan earthquake camera relay

`src/japanCameras.ts` maintains a geographic directory of public camera streams
linked from Japanese government, river-management and broadcaster pages. The
dashboard embeds the selected YouTube stream through the privacy-enhanced
`youtube-nocookie.com` player. It does not proxy, download, record, archive or
rehost any video. Ownership, availability, embedding permission and retention
remain controlled by each upstream provider.

Before embedding, `server/camera.mjs` reads the public YouTube player page to
confirm that a current video exists and that its owner permits third-party
embedding. The check uses no account, Cookie, token or private API and is cached
locally for five minutes. A failed, ended or non-embeddable stream is skipped in
favor of the next-nearest directory entry; the interface reports that skip.

During an explicit earthquake replay, a video is labelled as historical only
when the catalogue contains a provider-published archive interval covering the
event timestamp. Otherwise the panel clearly labels the content as a current
live fallback, not footage of the historical event. Fixed YouTube video IDs can
change without notice; the linked official page is the authoritative entry
point. CAPQuake was checked for provenance, but no camera adapter or camera list
was copied from that project.

- Hokkaido Regional Development Bureau: https://www.hkd.mlit.go.jp/ky/ki/kouhou/copy_of_copy_of_splaat000000hkd.html
- Aomori Prefecture airport cameras: https://www.pref.aomori.lg.jp/soshiki/kendo/airport/live-kamera.html
- Kanto Regional Development Bureau: https://www.ktr.mlit.go.jp/river/bousai/river_bousai00000072.html
- Tokyo storm-surge cameras: https://www.takashio-bosai.metro.tokyo.lg.jp/im/tkim0103g_7R09.html
- Nagano Prefecture Matsumoto Airport notice: https://www.pref.nagano.lg.jp/airport/kukou/documents/pressreleaselivecamera.pdf
- Kinki Regional Development Bureau: https://www.kkr.mlit.go.jp/river/bousai/livecamera.html
- Chugoku Regional Development Bureau: https://www.cgr.mlit.go.jp/bousai/saigai/index.html
- Shikoku Regional Development Bureau: https://www.skr.mlit.go.jp/nakagawa/
- Kyushu Regional Development Bureau: https://www.qsr.mlit.go.jp/useful/kasen_youtube.html
- Okinawa Television live camera: https://www.otv.co.jp/livecamera/

### Kanameishi seismic calculations and JMA site catalogue

`src/seismic.ts` independently ports the deterministic JMA instrumental
intensity and China seismic-intensity equations used by kanameishi. The compact
`public/data/jma-seismic-sites.json` catalogue is mechanically extracted from
kanameishi's `src/utils/JmaSeisIntLoc.js` so local JMA warning regions are
calculated from every observation site and the maximum result in each region,
instead of from a polygon centroid. The reference project is licensed under
AGPL-3.0; retain this notice and its corresponding source when redistributing
the derived catalogue or calculation code.

- Source: https://github.com/kotonoha0109/kanameishi
- License: https://www.gnu.org/licenses/agpl-3.0.html

## SREV intensity announcement sounds

Files `public/sound/srev/shindo0.mp3` through `shindo6.mp3` are unmodified
intensity announcement sounds from Scratch Realtime Earthquake Viewer Page.
The client maps intensity 7 to the provided `shindo6` cue and plays a cue only
when the real-time or explicit replay NIED maximum intensity rises. The files
are distributed under CC BY-SA 2.0.

- Source: https://github.com/kotoho7/scratch-realtime-earthquake-viewer-page
- License: https://creativecommons.org/licenses/by-sa/2.0/

## MSIL S-net observed-intensity history

`server/snet.mjs` reads the public minute-by-minute S-net strong-motion tiles
shown by the Japan Coast Guard's Marine Information Situational Indication Linkage
(MSIL, "MDA Situational Indication Linkages") service. It projects the official
S-net station coordinates onto the tiles, converts the rendered palette colors
back into continuous instrumental-intensity estimates, groups consecutive
qualifying frames into events, and stores the resulting private local history.
These derived values are not an official NIED seismic-intensity bulletin and
must remain labelled as palette-derived observations in the user interface.

The tile-path behavior and continuous palette-conversion equation were studied
from the open-source Zero-Quake and S-net Viewer implementations. CAPQuake was
also used to cross-check the current MSIL tile path. Retain the upstream license
terms and this provenance notice when redistributing the implementation.

- MSIL service: https://www.msil.go.jp/msil/htm/main.html?Lang=0
- NIED S-net overview: https://www.seafloor.bosai.go.jp/S-net/
- Zero-Quake source (GPL-2.0): https://github.com/0Quake/Zero-Quake
- S-net Viewer source: https://github.com/Ichihai1415/S-net_Viewer
- CAPQuake source (BSD-3-Clause): https://github.com/CelestialAsPeak/CAPQuake
