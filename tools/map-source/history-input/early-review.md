# 초기 시대 지도 검토: 1444·1550·1648

이 파일과 `early-review.json`, `early-corrections.cjs`는 역사 지도 초안을 검토하고 재생성하기 위한 자료다. **현재 균형 지도의 구획을 그대로 사용한 근사치**이며, 당시 행정구역이나 국경을 새로 측량한 결과가 아니다. 실제로 존재했던 국가의 이름과 정치적 관계를 최대한 보존하되, 자료에서 확인되지 않는 경계는 이용자가 고칠 수 있는 상태로 둔다.

## 자료와 해석의 구분

- 기본 영토 배치는 [Cliopatria 원본 저장소](https://github.com/Seshat-Global-History-Databank/cliopatria)의 연도별 `POLITY` 자료를 사용한다. `MemberOf`와 겹치는 집합 폴리곤은 국가를 모두 합치는 근거가 아니다.
- 아래의 직사각형 마스크는 **게임의 기존 프로빈스를 고르기 위한 편집 규칙**이다. 해당 마스크가 역사 자료에서 추출한 정밀한 국경선이라고 표현하면 안 된다.
- 봉신·동군연합 구성국·식민지를 별도 플레이 국가로 두는 것은 게임 편의다. 영향권에 상위 왕국·제국을 기록하여 독립국과 구분한다.
- 자료에 개별 경계가 없는 원주민 사회를 ‘무주지’로 처리하지 않는다. ‘여러 공동체·경계 미상’은 하나의 실제 통일국가라는 뜻도 아니다.
- 단일 프로빈스보다 작은 도시국가·영주는 빠질 수 있다. 주어진 구획의 수를 유지하면서 모든 영주와 월경지를 동시에 표현할 수는 없다.

## 1444년 유럽

- 콘스탄티노폴리스는 비잔티움 제국이다. 오스만의 점령은 1453년이다. 도시와 주변 현대 프로빈스의 크기가 다르므로 넓이가 근사된다. [메트로폴리탄 미술관](https://www.metmuseum.org/ko/essays/the-art-of-the-ottomans-before-1600)
- 카스티야·아라곤·나바라·그라나다는 단일 근대 스페인으로 합치지 않는다. 그라나다 나스르 왕조의 왕국은 1492년까지 존속했다. [알람브라 관리기관의 역사](https://www.alhambra-patronato.es/descubrir/alhambra-y-generalife/historia)
- 칼마르 동군연합은 덴마크·노르웨이·스웨덴의 구성 왕국으로 분리하고 연합을 영향권으로 표시한다. 핀란드·올란드는 스웨덴, 아이슬란드·페로와 당시 오크니·셰틀랜드는 노르웨이 쪽으로 정리한다. 지방별 실효지배와 북부 사미 사회의 경계는 단순화되어 있다.
- 원본의 `Serbian Empire`는 시대에 맞는 세르비아 전제공국으로 고친다. 남부의 옛 제국 최대 판도를 그대로 남기지 않는다. [세르비아 국립박물관](https://www.narodnimuzej.rs/middle-ages/post-byzantine-art-collection/?lang=en)
- 크루여를 중심으로 알바니아 제후들이 결성한 레저 동맹을 추가한다. 1444년 3월 2일 결성된 군사 동맹을 중앙집권적 근대국가로 설명하면 안 된다. [알바니아 관광청](https://akt.gov.al/en/atraksionet/memoriali-i-skenderbeut/)
- 이탈리아의 일반 제국령으로 뭉친 부분에서 만토바 후국, 루카·시에나 공화국, 에스테 가문령, 트렌토 주교후국, 살루초 후국 등 주요 중심지를 기존 프로빈스로 분리한다. 월경지와 작은 가문 영지는 합쳐져 있다.

## 1648년 유럽

이 초안은 **베스트팔렌 강화 이후**로 설명한다. 네덜란드 공화국과 스위스 연방의 독립을 표시하고, 남부 네덜란드는 별도의 스페인 종속 영토로 둔다. 강화로 프랑스가 알자스에서 얻은 권리는 중첩되어 있었으므로 현대 알자스 전체를 아무 구분 없이 프랑스 영토로 만들면 안 된다. [독일역사연구소의 1648년 지도와 해설](https://germanhistorydocs.org/en/the-holy-roman-empire-1648-1815/europe-in-1648-the-peace-of-westphalia), [네덜란드 국립기록원](https://www.nationaalarchief.nl/beleven/onderwijs/bronnenbox/eindelijk-vrede-1648)

- 원본의 `Commonwealth of England`는 1648년에 맞추어 잉글랜드 의회파 통치 지역으로 고친다. 공화정 선언은 1649년 5월 19일이다. 스코틀랜드와 아일랜드 가톨릭 연맹도 별도로 남긴다. 내전의 정확한 일자별 전선을 재현한 지도는 아니다. [영국 의회](https://www.parliament.uk/about/living-heritage/evolutionofparliament/legislativescrutiny/act-of-union-1707/overview/revolution-and-civil-war/)
- 피렌체 공화국이라는 원본 이름은 토스카나 대공국으로 고친다. 피렌체 공작위는 1532년, 토스카나 대공위는 1569년으로 구별한다. [Scuola Normale Superiore](https://piazzadeicavalieri.sns.it/en/the-piazza-over-the-centuries/historical-periods/early-modern-period/the-medici-dynasty/)
- 바이에른은 선제후국으로 표시한다. 바이에른의 선제후 지위는 1623년에 부여되고 1648년에 확정되었다. [바이에른 주정부](https://www.bayern.de/der-freistaat/bayerische-geschichte/)
- 원본의 `Astrakhan Khanate`는 실제로 돈강 부근에 놓여 있는 잘못된 폴리곤이다. 아스트라한 칸국은 1556년 러시아에 병합되었다. 돈강 카자크 및 북쪽 러시아 지역이라는 거친 편집 그룹으로 대체하고, 이것을 정밀한 돈 카자크 국경이라고 설명하지 않는다. [대통령도서관](https://www.prlib.ru/history/619351)
- 원본에서 뭉쳐 있는 제국 소제후국의 중심부를 뷔르템베르크·팔츠·바덴·헤센 카셀·헤센 다름슈타트·메클렌부르크·브라운슈바이크 뤼네부르크·쾰른 등으로 나눈다. 원래 별도 폴리곤이 있는 바이에른·작센·브란덴부르크는 덮어쓰지 않는다.
- 스페인령 밀라노·나폴리·시칠리아·사르데냐와 남부 네덜란드는 스페인 영향권 아래의 편집 가능한 종속 국가로 분리한다.
- 만토바는 공국, 모데나 레조는 별도 공국, 루카는 공화국이다. 우르비노는 1631년 교황령에 병합되었으므로 1648년에 다시 독립시키지 않는다. [롬바르디아 문화유산 기관](https://www.lombardiabeniculturali.it/istituzioni/storia/?unita=03.02), [페사로 시의회](https://www.comune.pesaro.pu.it/cultura/da-vedere/luoghi-da-vedere/edifici-storici-e-monumenti/edifici/palazzo-ducale/)

## 1550년 세계

- 델리·아그라의 주요 북인도 영토는 수르 제국이다. 후마윤의 무굴 왕조 복귀는 1555년이다. 카불 방면의 무굴 잔존 세력까지 지워서는 안 된다. [NCERT 공식 교과서](https://ncert.nic.in/textbook/pdf/gess103.pdf)
- 비자야나가라와 아마드나가르·비자푸르·비다르·베라르·골콘다 등 데칸 술탄국을 무굴 제국으로 전부 합치지 않는다. [메트로폴리탄 미술관](https://www.metmuseum.org/exhibitions/listings/2015/deccan-sultans/exhibition-galleries)
- 중국의 주요 왕조는 명, 한반도는 조선이다. 조선이 명에 조공한다는 관계가 명의 직접 영유를 의미하지 않는다. [국립고궁박물원](https://www.npm.gov.tw/Publications-Content.aspx?l=2&sno=04014485)
- 원본의 `Golden Horde`는 1550년에 몽골을 덮는 오기이므로 북원 몽골로 고친다. 투메드처럼 별도로 확인된 세력은 유지한다.
- 원본 `Maynila`의 복수 폴리곤에 오키나와가 잘못 섞여 있다. 류큐 왕국으로 고친다. 일본 본토의 빠진 해안은 전국시대 영주들, 홋카이도는 아이누 공동체로 두며, 자료에 없는 다이묘 경계를 정밀하게 복원했다고 주장하지 않는다.
- 폴란드와 리투아니아는 야기에우워 동군연합의 구성국으로 나눈다. 1569년 연방을 1550년 지도에 소급하여 하나로 만들지 않는다.
- 네덜란드는 카를 5세의 합스부르크령으로 둔다. 1550년에 이미 필리프 2세의 스페인령이라는 설명을 붙이지 않는다.
- 누에바에스파냐·페루 부왕령은 스페인 종속 영토로 편집할 수 있게 구분한다. 당시 지도의 식민 주장 전체가 실제 행정 지배를 뜻하지 않는다. [미국 의회도서관의 1562년 지도 해설](https://www.loc.gov/resource/g3290.ct000342/)
- 리마는 페루 부왕령의 중심이며 잉카 제국 최대 판도를 1550년까지 유지시키지 않는다. 빌카밤바의 잔존 국가는 별도 검토 대상이다. [메트로폴리탄 미술관의 안데스 연표](https://www.metmuseum.org/es/toah/ht/08/sanc.html)
- 서아프리카에서 말리·송가이는 동시대에 존재하는 별도 세력이다. 베닌 왕국은 오늘날 베냉 공화국이 아닌 나이지리아 남부에 있었다. [메트로폴리탄 미술관](https://www.metmuseum.org/exhibitions/sahel-art-empire-sahara), [대영박물관](https://www.britishmuseum.org/learn/schools/ages-7-11/africa/visit-resource-benin)

## 재검증 때 주의할 부분

1. `POLITY`라고 표시되어도 괄호 친 제국 집합과 구성국이 중복된다. 괄호만 없애서 국가가 두 개가 되거나 전체 제국이 다시 덮어쓰지 않는지 확인한다.
2. 현재 경계와 시대 경계가 만나는 작은 해안 프로빈스는 원본 자료에서 빠지기 쉽다. 조선·명·스웨덴·노르웨이 등의 확인 가능한 해안 틈을 채우되, 미확인 내륙을 식민 제국에 자동 편입하지 않는다.
3. 현대 소유 국가 ISO는 해안 틈과 기존 프로빈스를 찾는 용도로 사용한다. 현대 국가 전체를 옛 이름으로 바꾸는 지름길로 사용하지 않는다.
4. `early-corrections.cjs`의 변경 결과에는 `note`가 있다. 역사적 사실을 바로잡는 규칙과 플레이용 영토 구획 근사 규칙을 구분하여 보고서에 남긴다.
