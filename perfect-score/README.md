# Perfect Score

라이브 공연·세션 연주자를 위한 iPad 악보 뷰어 & 스마트 필기 앱 (PWA).

> **현재 진행: 1단계 완료** — 프로젝트 셋업, PDF/이미지 렌더링, 블루투스 페달 연동, 페이지 전환(즉시 / 반 페이지 / 가로·세로 스크롤)

## 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프레임워크 | React 19 + Vite + TypeScript | 서버 없이 정적 파일로 빌드되어 완전 오프라인 PWA와 Capacitor(iOS 앱) 포장에 가장 단순함 |
| 스타일 | Tailwind CSS v4, Lucide 아이콘 | |
| UI | shadcn/ui 방식 컴포넌트 (Radix UI 기반, `src/components/ui`) | `components.json` 포함 — `npx shadcn add …` 로 추가 가능 |
| PDF | `pdfjs-dist` (legacy 빌드, 웹 워커, `enableHWA`) | iPadOS 구버전 호환 + GPU 가속 캔버스 |
| 음악 폰트 | Bravura (SMuFL 표준, `@fontsource/bravura`) | 번들에 포함되어 오프라인에서도 사용 |
| 상태 | zustand (설정은 localStorage에 저장) | |
| 저장소 | IndexedDB (`idb`) | 악보 원본·메타데이터를 기기 안에 저장 |
| PWA | `vite-plugin-pwa` (Workbox) | 앱 셸·pdf.js 워커·폰트 프리캐시 |
| 테스트 | Vitest | 넘김 모델·페달 로직 단위 테스트 |

Next.js 대신 Vite를 쓴 이유: 이 앱은 서버 기능이 없는 오프라인 앱이라 Next.js의 SSR·라우팅 장점이 거의 없고, Capacitor는 정적 `dist/` 폴더를 그대로 포장합니다. 나중에 Next.js로 옮기더라도 `src/core`는 프레임워크와 무관한 순수 TypeScript라 그대로 쓸 수 있습니다.

## 실행

```bash
npm install
npm run dev        # 개발 서버 (같은 Wi-Fi의 iPad에서 http://<PC IP>:5173 접속 가능)
npm test           # 단위 테스트
npm run build      # 타입 검사 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 확인 (서비스 워커 동작)
npm run icons      # 앱 아이콘 다시 생성 (Playwright 필요)
```

### iPad에 설치

1. `dist/`를 HTTPS로 호스팅합니다(GitHub Pages, Netlify, Vercel 등 — 상대 경로로 빌드되어 하위 경로도 가능).
2. iPad Safari로 접속 → 공유 → **홈 화면에 추가**.
3. 홈 화면 아이콘으로 실행하면 주소창 없는 전체 화면으로 열리고, 오프라인에서도 동작합니다.

> Safari 탭에서만 쓰면 iPadOS가 오래 쓰지 않은 사이트의 데이터를 지울 수 있습니다. 반드시 홈 화면에 추가해서 쓰세요.

App Store 배포나 파일 앱 연동이 필요해지면 Capacitor로 포장합니다: `npm i @capacitor/core @capacitor/ios && npx cap init "Perfect Score" com.example.perfectscore --web-dir dist && npx cap add ios` (Xcode가 있는 Mac 필요).

## 1단계 기능

- **악보함**: PDF 여러 개 가져오기, 악보 사진 여러 장 → 한 곡으로 묶기, 썸네일, 검색·정렬, 이어보기
- **페이지 넘김 방식**
  - **즉시 전환**: 다음/이전 화면을 미리 렌더링해 두고 캔버스 노드만 교체 → 페달과 같은 프레임에 전환
  - **반 페이지 넘김**: `[3쪽] → [위: 4쪽 윗부분 / 아래: 3쪽 아랫부분] → [4쪽]`. 두 쪽 보기에서는 `[1|2] → [3|2] → [3|4]`처럼 이미 연주한 쪽부터 교체. 경계 위치(30~70%) 조절 가능
  - **가로 / 세로 부드러운 스크롤**: 보이는 페이지만 렌더링. 세로는 한 번에 화면의 85%씩 이동해 시선이 이어짐
- **블루투스 페달**: ←/→, ↑/↓, PageUp/PageDown, Space, Enter 기본 지원
  - 길게 눌렀을 때의 자동 반복과 접점 튐(150ms)을 무시 → 두 장이 넘어가는 사고 방지
  - 설정 창에서 들어오는 키를 실시간 확인하고, "페달로 지정"으로 원하는 키를 학습
- **자동 레이아웃**: 가로 = 두 쪽, 세로 = 한 쪽. 회전해도 보던 페이지 유지
- 화면 좌우 탭(끌 수 있음) · 스와이프 · 가운데 탭으로 메뉴 숨김, 연주 중 화면 꺼짐 방지

## 구조

```
src/
  core/                    # 프레임워크와 무관한 순수 로직 (단위 테스트 대상)
    document/              #   ScoreSource 추상화: PDF(pdf.js) / 이미지 묶음
    render/renderCache.ts  #   렌더링 캔버스 LRU 캐시 (iOS 캔버스 메모리 관리)
    navigation/navigator.ts#   페이지 넘김 상태 모델 (즉시·반 페이지, 한 쪽·두 쪽)
    pedal/                 #   키 매핑, PageTurner (반복·튐 방지, 입력창 무시)
  features/
    library/               # 악보함, 가져오기
    viewer/                # PagedView(즉시·반 페이지), ScrollView, 설정 창
  components/ui/           # shadcn/ui 컴포넌트 (Radix)
  hooks/                   # usePageTurner, useWakeLock, useElementSize
  lib/                     # db(IndexedDB), smufl(음악 글리프 맵), utils
  stores/                  # zustand: 보기 설정, 토스트
  pwa/                     # 서비스 워커 등록·업데이트 알림(공연 중 자동 새로고침 방지)
```

## 다음 단계

### 2단계 — 필기 레이어 & 스마트 기호 변환
- Konva.js 레이어를 각 페이지 슬롯 위에 올림 (반 페이지 넘김에서도 위/아래 영역별로 해당 페이지 필기 표시). 좌표는 페이지 비율로 저장.
- Apple Pencil 필압 펜·형광펜·지우개, 손바닥 무시.
- 손글씨 인식: 스트로크를 리샘플링해 $P / $Q 포인트 클라우드 인식기로 기호 템플릿(음표 머리·줄기·꼬리, 쉼표, #, b, 악센트, 스타카토, 페달, 도돌이표, X, 슬래시)과 매칭 → 인식된 위치·크기만 저장하고 `src/lib/smufl.ts`의 Bravura 글리프로 렌더링.
- 코드 네임 텍스트 레이어: `chordSymbolParts()`로 #/b 를 SMuFL 임시표로 표기.

### 3단계 — 공연 기능
- 세트리스트(페달 길게 누르기 = 다음 곡), 북마크·마디 번호 이동, 여백 자동 자르기
- 공연 모드(필기 도구·탭 영역 잠금), 다크/세피아 배경·디밍, 메트로놈
