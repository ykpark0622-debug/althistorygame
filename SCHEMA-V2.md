# V2 implementation contract

Keep schemaVersion 1 data and saves working without mutation. V2 adds optional map and mode. `mode` is `chronicle` (default) or `reign`; V1 always runs chronicle.

## Map

`MapTemplates.get(id)` returns `{id,name,width,height,provinces:[{id,name,owner,path,cx,cy}],countries:[{id,name,color}],notice,source}`. `MapTemplates.list()` returns templates. IDs: `eastasia1419`, `world1754`. Registry loaded before engine. No external runtime dependency. Renderer is `MapView.render(container,scenario,state,{onProvince,compareState})`; read-only unless callback. Root owns registry, renderer and player integration.

Scenario `map: {templateId,playerCountry,countries:[{id,name,color}],initial:{owners:{prov:country},occupation:{prov:country},influence:{prov:country},markers:{prov:text}}}`. Countries combine template defaults + overrides. All initial dicts optional. Engine state `map:{owners,occupation,influence,markers}`; default owners come from template. Non-owner layers may be absent/null. No map -> no state.map required for V1.

Choice `territory:[{prov,to?,occupation?,influence?,marker?}]`; null clears non-owner layers. `to` changes ownership. Also `result` string and `historical` boolean. Same effect fields allowed in between/settlement rules. Reject unknown province/country references. Avoid injecting untrusted SVG: map paths are bundled templates only.

Condition `{kind:'territory',key:provinceId,field:'owner'|'occupation'|'influence'|'marker',op:'eq'|'ne',value:countryId|string|null}`; marker compares string/null; default field owner. V1 conditions stay unchanged.

### Country label positions and map tools (v2.9)

Country overrides optionally contain `labelPosition: [x, y]`, in the chosen template's **local SVG coordinates**: `0 <= x <= template.width`, `0 <= y <= template.height`. An explicit `null` hides the label. An absent property uses automatic placement. This is separate from `focusBounds`, which controls the camera's country jump. The map document remains schemaVersion 1 and scenarios remain schemaVersion 2; old files do not need conversion. Map JSON normalization preserves explicit hidden labels and custom positions, clones coordinate arrays and rejects nonfinite or outside-map positions. Runtime map state and replay remain unchanged; positions belong to scenario/map metadata.

`MapView.render` additionally accepts `{labelEditMode,labelPlacementCountry,onLabelMove}`. Only editor calls enable label interaction. `onLabelMove(countryId,[x,y])` commits a label drag or map-click placement; normal play never moves labels. Moving labels respects zoom, pan and cropped map origins. Custom countries can derive automatic label anchors from their current territory. Countries without territory do not leave old labels on blank maps. A selected placement target can preview its location in edit mode.

The workshop uses native color inputs and preset swatches; hexadecimal codes remain optional. Country searches filter names and IDs while retaining the current selection. Blank maps assign all provinces to a neutral editable country with a hidden label, clear initial non-owner layers (including template defaults), and retain story data, country metadata, province IDs and geometry. One-level undo restores the entire prior map. Changing the visible hatch checkboxes continues to affect display only.

Country label coordinates travel with JSON export/import, local saves, gallery map documents and maps converted to scenario drafts. The existing gallery stores these optional JSON properties; no extra database column or migration is required. Editors or offline programs older than v2.9 cannot read maps containing the new `labelPosition` property and should be updated first.

## Reign

`reign:{parts:[{id,name,color}],turns:[{id,date,title,body,eventIds:[eventId,...],between:[rule,...],settlements:[rule,...]}]}`.

Each referenced ordinary event has `part:partId` and otherwise existing event shape/choices. Engine ignores ordinary next links when choosing a reign part. In each turn, first eligible event per part is used. No eligible card means part is skipped. The remaining cards may change when flags/stats change. A selected part stays selected. Event choices may have conditions. Random events still live in the common events collection with RETURN.

Rule `{id,text,when:[],effects:{stat:delta},setFlags:{flag:boolean},territory:[]}`. Apply all matching rules in written order. `between` on turn entry (including first turn), settlements on settle. Effects apply immediately and clamp; later rules see prior rule effects. Rule text appears in result list. Supports deferred consequence through later turn's between with flag/stat conditions.

Engine APIs:
- `getMapConfig(scenario)` -> template merged countries etc (optional convenience).
- `getReignStatus(scenario,state)` -> `{turn,turnIndex,cards:[{part,event,choices}],decisions,ready,results,between}`; `choices` same wrapper as getChoices.
- `choosePart(scenario,state,eventId,choiceIndex)` -> new state.
- `settleTurn(scenario,state)` -> new state; requires all currently eligible parts selected; applies settlements then enters next turn or ending. Last results retained for UI.
- `getChoices(scenario,state,eventId?)` supports optional event for cards.
- `choose` continues to handle chronicle and active random event responses.
- `restoreState` replay verified history actions; optional V2 history action `part` and `settle`. Old records with no action still use choose. Record eventId/current choiceIndex as needed. Never trust raw saved map/reign stats/results.

State reign contains `{turnIndex,decisions:{partId:{eventId,choiceIndex}},results:[],between:[]}`; state.eventId may be null between reign decisions, but active random event uses actual id. Pending random interruption destination internal `REIGN` resumes cards on RETURN. Immediate endings evaluated after each choice and settlement; existing RNG algorithm unchanged.

Optional engine `getHistoricalReference(scenario)` computes reference by marked historical choices only, ignoring random encounters/risks; return `{state,complete,reason}`. If unavailable UI can omit comparison. Do not label arbitrary first choices actual history.

## Editor, AI, gallery

Editor add mode selector, map tab, reign turns tab. Upgrade draft to schemaVersion 2 when enabling feature; no silent downgrade. Map allows click province to edit initial owners and choice territory effects. Flow inspector supports result/historical/territory; graph retains V1 behavior. Reign editor can reuse existing events and expose parts, eventIds, between/settlements via guarded JSON text areas if necessary.

AI prompt includes selected mode/template and province/country IDs; supports v1/v2 imports. Gallery supports both versions, displays mode/map badges. Database migration extends version check to 1/2; full fresh schema also supports both. Do not change auth/RLS behavior. Root generates standalone and release ZIP after agents complete.
