# Gato's Header Menu — v0.2.0

Foundry VTT v14 (0.3.0부터; v13은 0.2.x). **요구 모듈**(0.2.0부터): [gatos-lib](../gatos-lib/README.md) — 설치·활성화 필요(비활성이면 ready에서 경고); 기능·API·설정 키·lang 키는 0.1.0과 같습니다. 시스템 무관(PF1 시트처럼 모듈 버튼이 많은 V1 창을 위해 제작).

시트 제목 표시줄에는 고른 버튼만 남기고, 나머지 모듈 버튼은 전부 **⋮ 메뉴** 하나로 모읍니다.

```
전: 제목 · PopOut! · Sheet · HUD Overlay URL · Configure · Wallet · Theatre · Add to Stage · Craft · Cinematic FX · Prototype Token · 태그 · Close
후: 제목 · PopOut! · Prototype Token · ⋮ · 태그 · Close
```

## 동작

- 기본으로 남는 버튼: **닫기**, **프로토타입 토큰**. 팝아웃!(popout)과 작업표시줄의 **태그**(lichsoma-taskbar)는 모듈이 페이지에 직접 끼워 넣는 버튼이라 원래 자리에 그대로 남습니다.
- 그 외(시트 설정, Item Piles, Theatre, Wallet, Cinematic FX, HUD Overlay URL, 제작 등)는 ⋮ 메뉴로 이동. 메뉴 항목을 누르면 원래 버튼과 똑같이 동작합니다.
- ⋮ 메뉴 맨 아래 **"표시할 버튼 고르기…"**(GM)에서 체크리스트로 남길 버튼을 바꿀 수 있습니다. 한 번이라도 열어 본 시트의 버튼이 목록에 나타납니다. 저장하면 열려 있는 시트에도 즉시 반영됩니다.
- 설정
  - 헤더 버튼 접기(클라이언트): 끄면 원래대로.
  - 적용할 창(월드): 액터 시트 / 액터·아이템 시트(기본) / 모든 문서 시트 / 모든 V1 창.
  - 제목 표시줄에 남길 버튼(월드): 버튼 CSS 클래스 목록(체크리스트와 같은 값).
  - 남긴 버튼은 아이콘만(클라이언트): 남긴 버튼도 아이콘+툴팁으로 줄임.
  - ⋮ 버튼에 글자 표시, 이 개수부터 접기.

## 구현 메모

- Foundry v13·v14의 V1 창은 `_getHeaderButtons()`에서 버튼을 만들고(기본 클래스가 닫기 + `get<클래스>HeaderButtons` 훅, 이후 ActorSheet가 프로토타입 토큰 추가), `_renderOuter()`가 그 결과를 한 번 동기적으로 읽어 제목 표시줄을 그립니다.
- 이 모듈은 lib-wrapper로 `Application.prototype._renderOuter`를 감싸고, 그 호출 동안만 인스턴스의 `_getHeaderButtons`를 가려 **최종 목록**(모든 훅 + 하위 클래스 추가 후)을 나눕니다. lib-wrapper가 없으면 프로토타입을 직접 감쌉니다.
- 설정 변경 시 열린 창은 Foundry가 만든 헤더 버튼만 다시 만들어 끼웁니다(V1은 재렌더 시 제목 표시줄을 다시 그리지 않음).
- AppV2 창은 이미 자체 ⋮ 메뉴가 있어 대상이 아닙니다.
- v14: V1 `Application`의 `_renderOuter`/`_getHeaderButtons`/`app-window.html` 구조는 v13과 같고, 바뀐 것은 닫기 버튼 라벨 키(`Close` → `APPLICATION.ACTIONS.Close`)뿐이라 코드 변경은 없습니다(클래스 `close`로 판별).

## 검증 (2026-10-22, Foundry v13.351 + PF1 v11.11, 실제 데이터와 분리된 스크래치 복사본)

> v14(0.3.0)는 아직 실제 월드에서 검증하지 않았습니다. 아래는 v13 기록입니다.

greyhawk 월드에서 헤더 버튼을 추가하는 모듈들(popout, lichsoma-taskbar, item-piles, theatre, glitchsmith-lib, stylish-action-hud, cinematic-cut-ins, koboldworks-pf1-little-helper, gatos-pf1-item-crafting 등)을 함께 켜고 확인:
- 액터 시트 헤더 8개 → ⋮ 메뉴, 아이템 시트 4개 → ⋮ 메뉴. 팝아웃·태그·프로토타입 토큰·닫기는 그대로.
- 메뉴의 "Craft"(제작 창)·"Sheet"(시트 설정) 클릭 시 원래 창이 열림.
- 체크리스트로 Craft를 남기면 열린 시트 헤더에 즉시 추가/제거, 아이콘만 모드 즉시 반영.
