# 역사 기본안 5종 · v2.8

| 지도 | 기준 시점 | 지역 수 | 소유 영토가 있는 편집 단위 |
| --- | --- | ---: | ---: |
| 유럽 15세기 · 1444년 | 1444년 무렵 | 2,431 | 106 |
| 유럽 17세기 · 1648년 | 1648년 베스트팔렌 조약 이후 | 2,431 | 75 |
| 세계 16세기 · 1550년 | 1550년 무렵 | 5,939 | 174 |
| 제1차 세계대전 전야 · 1914년 | 1914년 7월, 유럽 전쟁 발발 직전 | 5,939 | 137 |
| 제2차 세계대전 전야 · 1939년 | 1939년 8월, 폴란드 침공 직전·중일전쟁 진행 중 | 5,939 | 149 |

## 제작 기준과 정확도

세계 지도는 기존 5,939개 균형 구획, 유럽은 기존 유럽·지중해 균형 지도 2,431개 구획을 그대로 사용합니다. 지형·해안선·프로빈스 모양과 ID는 바꾸지 않았습니다. 시점에 맞춰 국가/정치 단위의 이름과 소유권을 바꿉니다.

Cliopatria v0.2.1의 연도별 POLITY 경계를 추출하고, 각 구획 내부의 7×7 표본에 대해 가장 작은 해당 정치 단위를 찾아 다수 표본의 단위에 배치했습니다. 자동 배치 뒤 잘못된 시대 명칭·큰 오배치·해안 공백을 별도 코드로 보정했습니다. 보정에 사용한 단순 좌표 범위는 게임용 근사 마스크이며, 자료에서 추출한 정확한 역사 국경선이 아닙니다.

**정밀 복원 지도가 아닌, 편집용 역사 기본안입니다.** 현재 구획보다 작은 도시국가·월경지는 생략되거나 큰 구획으로 대표됩니다. 유럽 제후국 모두와 일본의 모든 다이묘를 재현하지 않았습니다. 1550년은 아프리카·아메리카·오세아니아와 일부 아시아 지역의 자료가 특히 부족합니다. 그곳을 하나의 실재 국가나 무주지라고 주장하지 않도록 여러 공동체/지방 세력이라는 편집 단위로 묶었습니다. 이 단위들은 실제 단일 국가가 아닙니다. 현대 지명은 지역 검색을 위해 남아 있습니다.

식민지·동군연합 구성국·자치령·보호령도 시나리오를 쓸 수 있는 단위로 나누었습니다. 지도에서 따로 색칠되어 있다고 모두 독립 주권국인 것은 아닙니다. 영향권 빗금은 모국/상위 세력의 관계를 간단히 표시하며, 조공·동군연합·연방·식민지의 법적 성격을 동일시하는 규칙은 없습니다.

1444년은 칼마르 구성국·백년전쟁·발칸의 정치 단위를,1648년은 베스트팔렌 이후 제국 제후국·네덜란드·스위스를,1550년은 명·조선·수르·오스만·각 인도/동남아 세력과 유럽 식민지 거점을 구분했습니다.1914년은 유럽 전쟁 개전 전이며,1939년은 폴란드 분할 전입니다.1939년 중국의 일본군 점령은 소유권과 구분한 빗금으로 표현합니다. 일본의 한반도·대만 지배, 만주국, 보헤미아·모라비아 보호령과 슬로바키아도 따로 보정했습니다.

## 자료와 재배포

- [Cliopatria / Seshat Global History Databank v0.2.1](https://github.com/Seshat-Global-History-Databank/cliopatria/tree/v0.2.1): 역사 경계. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). 연도 추출·구획 재배치·한국어 번역·수동 보정한 파생 정치 배치 데이터입니다. 해당 출처·라이선스·변경 표시를 유지해 재배포할 수 있습니다.
- 바탕 지형은 기존 Natural Earth/geoBoundaries 자료입니다. WORLD-MAP-SOURCES.md,BALANCED-MAP-SOURCES.md,MAP-SOURCES.md와 tools/map-source/licenses 안의 개별 조건을 유지하세요. 모든 geoBoundaries 자료가 퍼블릭 도메인인 것은 아닙니다.
- 유료 게임이나 MapChart/Paradox의 지도 자산은 사용하지 않았습니다.
- 게임은 자료를 매번 외부 서버에서 받지 않습니다. 역사 배치 패치와 기존 선택한 균형 지형만 해당 사이트에서 읽습니다. 오프라인 파일에는 자료가 포함됩니다.

## 보정 확인에 참고한 자료

- [Cliopatria primary repository](https://github.com/Seshat-Global-History-Databank/cliopatria) — POLITY/RELATION, MemberOf, dated polygon records, and uncertainty limitations.
- [German Historical Institute: Europe in 1648](https://germanhistorydocs.org/en/the-holy-roman-empire-1648-1815/europe-in-1648-the-peace-of-westphalia) — Post-Westphalia Dutch and Swiss independence; territorial settlement overview.
- [Nationaal Archief: Eindelijk vrede (1648)](https://www.nationaalarchief.nl/beleven/onderwijs/bronnenbox/eindelijk-vrede-1648) — Dutch-Spanish peace and ratification in 1648.
- [Metropolitan Museum: The Art of the Ottomans before 1600](https://www.metmuseum.org/ko/essays/the-art-of-the-ottomans-before-1600) — Constantinople1453 and Mamluk Syria/Egypt1517.
- [NCERT: Delhi,12th to15th centuries](https://ncert.nic.in/textbook/pdf/gess103.pdf) — Sur dynasty1540–1555 and Humayun's restoration1555.
- [Metropolitan Museum: Sultans of Deccan India1500–1700](https://www.metmuseum.org/exhibitions/listings/2015/deccan-sultans/exhibition-galleries) — Five Deccan sultanates and Vijayanagara before1565.
- [UK Parliament: The Articles,constitution and trade](https://www.parliament.uk/about/living-heritage/evolutionofparliament/legislativescrutiny/act-of-union-1707/overview/the-articles-constitution-and-trade/) — Single kingdom Great Britain only begins1May1707.
- [National Palace Museum: The Evolving Landscape of Geopolitics](https://www.npm.gov.tw/Publications-Content.aspx?l=2&sno=04014485) — Ming1368–1644,Joseon1392–1910,Ryukyu unification1429 and East Asian political order.
- [Metropolitan Museum: The Art of the Safavids before1600](https://www.metmuseum.org/fr/essays/the-art-of-the-safavids-before-1600) — Safavid dynasty from1501; political situation in Iran.
- [Metropolitan Museum: Sahel,Art and Empires](https://www.metmuseum.org/exhibitions/sahel-art-empire-sahara) — Mali and Songhay dynasties coexist in the16th century.
- [British Museum: Benin](https://www.britishmuseum.org/learn/schools/ages-7-11/africa/visit-resource-benin) — Benin Kingdom location in present southwesternNigeria and15th/16th-century power.
- [Metropolitan Museum: Central and Southern Andes1400–1600](https://www.metmuseum.org/es/toah/ht/08/sanc.html) — Spanish conquest and Viceroyalty of Peru1542; Inca royal remnant ends1572.
- [Library of Congress: Americae sive qvartae orbis partis nova et exactissima descriptio](https://www.loc.gov/resource/g3290.ct000342/) — The1562 Spanish map asserts colonial claims, not a neutral account of effective territorial administration.
- [PresidentialLibrary: RussianforcescaptureAstrakhan](https://www.prlib.ru/history/619351) — FinalannexationoftheAstrakhankhanatein1556.
- [UKParliament: Revolutionandcivilwar](https://www.parliament.uk/about/living-heritage/evolutionofparliament/legislativescrutiny/act-of-union-1707/overview/revolution-and-civil-war/) — Commonwealthdeclared19May1649;threecountriesduring1648civilwars.
- [AlbanianNationalTourismAgency: SkanderbegMemorial](https://akt.gov.al/en/atraksionet/memoriali-i-skenderbeut/) — LezheLeagueformed2March1444.
- [NationalMuseumofSerbia: PostByzantineArtCollection](https://www.narodnimuzej.rs/middle-ages/post-byzantine-art-collection/?lang=en) — SerbianDespotateinSmederevofall1459.
- [ScuolaNormaleSuperiore: TheMediciDynasty](https://piazzadeicavalieri.sns.it/en/the-piazza-over-the-centuries/historical-periods/early-modern-period/the-medici-dynasty/) — Florentineducalrank1532; grandducalrank1569.
- [LombardiaCulturalHeritage: Mantua](https://www.lombardiabeniculturali.it/istituzioni/storia/?unita=03.02) — Marquisatebefore1530; duchyafter1530.
- [MunicipalityofPesaro: PalazzoDucale](https://www.comune.pesaro.pu.it/cultura/da-vedere/luoghi-da-vedere/edifici-storici-e-monumenti/edifici/palazzo-ducale/) — UrbinoannexedtotheHolySeein1631.
- [BavarianStateGovernment: Bavarianhistory](https://www.bayern.de/der-freistaat/bayerische-geschichte/) — Electoraldignity1623.
- [MuseoFerrara: HouseofEste](https://www.museoferrara.it/en/view/s/d03e257abeea44a4b2c676f99ec612a4) — FerrarapassedtoPapacy1598.
- [Library of Congress — Africa, 1914 (contemporary map)](https://www.loc.gov/resource/gdcwdl.wdl_15665/) — 1914 아프리카 식민 지배권의 동시대 지도 확인; 지도 도형 자체는 복제하지 않음
- [National Army Museum — Moran's War Map, 1914](https://collection.nam.ac.uk/detail.php?acc=2012-11-17-1) — 1914 개전 전후 유럽 국경과 전쟁 발발 연표의 동시대 참고
- [National Army Museum — East Africa campaign](https://www.nam.ac.uk/explore/east-africa-campaign) — 독일령 동아프리카의 1914 지위
- [National Army Museum — East Africa / Empire & Commonwealth](https://ww1.nam.ac.uk/videos/empire-commonwealth-east-africa/) — 독일의 4개 아프리카 식민지와 전쟁 중 점령 순서
- [National Army Museum — 1914 timeline](https://ww1.nam.ac.uk/theme/year-1914/) — 칭다오·독일 식민지 점령 시점을 7월 초와 분리
- [New Zealand Ministry for Culture and Heritage — British Empire](https://nzhistory.govt.nz/page/british-empire) — 1914 자치령 목록과 제국 전쟁 참여 관계
- [New Zealand Ministry for Culture and Heritage — Dominion of New Zealand](https://nzhistory.govt.nz/war/new-zealand-facts) — 뉴질랜드 자치령의 1914 헌정 지위
- [US Department of State — US Relations With the Republic of Korea](https://2021-2025.state.gov/u-s-relations-with-the-republic-of-korea/) — 1910~1945 일본의 한반도 식민지배 시기
- [USHMM — Czechoslovakia](https://encyclopedia.ushmm.org/content/en/article/czechoslovakia) — 1938~1939 체코슬로바키아 분할, 보호령, 슬로바키아, 헝가리 양도
- [USHMM — Invasion of Poland, Fall 1939](https://encyclopedia.ushmm.org/content/en/article/invasion-of-poland-fall-1939) — 8월 지도에서 9월 분할을 배제
- [USHMM — German-Soviet Pact](https://encyclopedia.ushmm.org/content/en/article/german-soviet-pact) — 1940 발트·베사라비아·핀란드 양도를 1939년 8월로 소급하지 않음
- [USHMM — Vilna](https://encyclopedia.ushmm.org/content/en/article/vilna) — 빌노의 1939년 10월 리투아니아 이양
- [FRUS1939 VolumeII Document326 — Albanian protest to Italian invasion](https://history.state.gov/historicaldocuments/frus1939v02/d326) — 1939년 4월 이탈리아의 알바니아 침공에 대한 동시대 외교 기록
- [FRUS1936 VolumeIII — Ethiopian-Italian conflict](https://history.state.gov/historicaldocuments/frus1936v03/ch6) — 1936년 이탈리아의 에티오피아 병합 주장 및 불승인 문제
- [FRUS1939 VolumeIV — Undeclared War Between Japan and China](https://history.state.gov/historicaldocuments/frus1939v04) — 일본 점령과 중국의 명목 소유, 상하이 국제조계의 구별
- [FRUS1931-1941 VolumeI index](https://history.state.gov/historicaldocuments/frus1931-41v01/index) — 1931년 만주 점령과 만주국 수립의 외교 기록
- [US Army Center of Military History — The Eastern Mandates](https://www.govinfo.gov/content/pkg/GOVPUB-D101-PURL-gpo89049/pdf/GOVPUB-D101-PURL-gpo89049.pdf) — 1938 우한/광저우 및 1939 하이난 작전 연표
- [FRUS1926 VolumeII Document434 — Tangier statute chronology](https://history.state.gov/historicaldocuments/frus1926v02/d434) — 1912 특별구역과1923 국제관리규정 구분
- [Japan National Archives — First Sino-Japanese War](https://www.archives.go.jp/learning/archive_collection_9/collection_3/) — 1895년 시모노세키 조약과 타이완·펑후 할양 시점 확인
- [FRUS1914 — Mexico diplomatic correspondence](https://history.state.gov/historicaldocuments/frus1914/d653) — 1914년 멕시코의 자료 공백을 멕시코 국가 소유로 보충하되 내전 통제를 완전히 재현하는 지도는 아님
- [FRUS1935 VolumeIII Document34 — Soviet special position in Sinkiang](https://history.state.gov/historicaldocuments/frus1935v03/d34) — 신장성 정부 성스차이와 소련 관계, 중국공산당 독립 영토라는 오표기 수정
- [FRUS1938 VolumeIII Document259 — Carlson report from northwestern China](https://history.state.gov/historicaldocuments/frus1938v03/d259) — 옌안이 중국공산당 활동 중심이며 산시성 북부에 위치함을 확인; 영향권은 고정 구획에 맞춰 근사
- [Metropolitan Museum: Gujarat textile](https://www.metmuseum.org/art/collection/search/452913) — 구자라트 술탄국의 시대·지역 확인. 공백 지역에 적용한 대략적인 구자라트 마스크는 자체 편집입니다.

## 재생성

완성된 역사 배치는 tools/map-source/historical-presets.json,공개 원본의 해당 연도 발췌와 보정 코드는 tools/map-source/history-input에 있습니다.

1. node tools/build-historical-definitions.cjs
2. node tools/build-map-assets.cjs
3. node build.cjs
4. node run-tests.cjs

브라우저용 배포에서는 기존 standalone.html 다운로드 래퍼를 유지하고,정식 웹 패키징 절차를 사용하세요. 위 build.cjs가 만든 대용량 standalone.html 자체를 GitHub 웹 업로드에 넣을 필요는 없습니다.
