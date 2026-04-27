# 지피로지스 학습용 문서 02
# control_v2.2.html 관리자 콘솔 완전 해설

이 문서는 `control_v2.2.html`만 집중적으로 해설한다.
목표는 “이 HTML이 어떻게 만들어졌는지”, “각 구성요소가 무슨 역할을 하는지”, “왜 이렇게 구현했는지”를 이해하는 것이다.

---

## 1. 파일 성격

`control_v2.2.html`은 관리자용 통합 관제 시스템이다.

한 파일 안에 아래 4가지가 같이 들어 있다.

- HTML 마크업
- CSS 스타일
- Firebase 초기화 코드
- 관리자용 비즈니스 로직

즉 전형적인 **단일 파일형 관리자 앱**이다.

---

## 2. 외부 라이브러리 구성

헤드에서 바로 CDN을 불러오는 구조다.

### 포함된 리소스

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?...&libraries=services"></script>
<script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
<script src="https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js"></script>
```

### 각각의 역할

- Tailwind CSS: 전체 레이아웃/버튼/간격/색상 스타일링
- Lucide: 아이콘 렌더링
- Kakao Maps: 대시보드 지도 표시
- Daum Postcode: 현장 주소 검색
- SheetJS: 엑셀 읽기/쓰기

### 공부 포인트

이 방식은 빌드 과정이 없어서 빠르다.
대신 버전 고정, 캐시, 최적화, 의존성 관리 측면에서는 한계가 있다.

---

## 3. CSS 구조 해설

이 파일은 Tailwind를 쓰지만, 공통적인 반복 UI는 직접 CSS 클래스로 정의했다.

### 대표 커스텀 클래스

- `.sidebar-menu`
- `.view-section`
- `.loading-overlay`
- `.quick-dispatch-row`
- `.excel-drop-zone`
- `.text-ellipsis`
- `.custom-scrollbar`

### 왜 Tailwind만 안 쓰고 CSS를 섞었나

실무에서 이런 혼합형이 자주 나온다.

- Tailwind: 빠른 유틸리티 조합
- 직접 CSS: 반복 컴포넌트 재사용

예를 들어 사이드 메뉴 hover, active, 그림자, 이동 효과는 한 줄 Tailwind보다 별도 클래스로 빼는 게 더 읽기 쉽다.

---

## 4. 전체 HTML 레이아웃 구조

관리자 콘솔은 크게 4층 구조다.

### 4-1. 로딩 오버레이

```html
<div id="loadingOverlay" class="loading-overlay hidden">...</div>
```

역할:
- 저장/삭제/배차 전송 등 비동기 작업 중 사용자 입력 차단
- UX 안정화

### 4-2. 관리자 인증 모달

```html
<div id="authModal" ...>
  <input type="password" id="adminAuthPw">
</div>
```

역할:
- 관리자 접속 전 비밀번호 확인

솔직히 이건 **진짜 보안이 아니라 화면 잠금 수준**이다.
학습용으론 이해하기 쉽지만, 운영환경에서는 Firebase Auth 같은 정식 인증으로 바꿔야 한다.

### 4-3. 좌측 사이드바

메뉴 id:

- `menu-dashboard`
- `menu-dispatch`
- `menu-vehicles`
- `menu-sites`
- `menu-logs`

역할:
- 섹션 전환
- 상태 배지 표시 (`badgePending`)
- 최종 동기화 시간 표시

### 4-4. 메인 콘텐츠 영역

뷰 id:

- `view-dashboard`
- `view-dispatch`
- `view-vehicles`
- `view-sites`
- `view-logs`

`switchView()`가 이 뷰의 `active` 클래스를 바꾸며 화면을 바꾼다.

---

## 5. 뷰별 구조 해설

## 5-1. 통합 관제 뷰

### 구성

- 상단 통계 카드 5개
  - `statActive`
  - `statWaiting`
  - `statTodayDone`
  - `statTotalVehicles`
  - `statPendingApproval`
- 지도 영역 `mainMap`
- 실시간 상태 테이블 `liveStatusTable`

### 왜 이렇게 설계했나

관리자는 첫 화면에서

- 지금 몇 대가 돌고 있는지
- 오늘 얼마나 끝났는지
- 승인 대기 차량이 몇 개인지
- 현재 배차 상태가 뭔지

를 한 번에 봐야 한다.

그래서 카드 + 지도 + 상태표 조합으로 구성한 것이다.

---

## 5-2. 배차 관리 뷰

### 상단 액션

- 상태 필터 `dispatchStatusFilter`
- 단건 전송 버튼
- 빠른 연속 입력 버튼
- 엑셀 업로드 버튼
- 템플릿 다운로드 버튼

### 하단 리스트

- `dispatchListTable`

### 설계 의도

배차는 입력 방식이 3개다.

1. 단건: 급한 건 즉시 처리
2. 빠른 연속 입력: 차량 한 대에 여러 건 연속 배차
3. 엑셀 업로드: 대량 작업

이게 바로 하이브리드 구조다.

---

## 5-3. 차량 관리 뷰

### 구성

- 차량번호 검색 `vehicleSearchInput`
- 신규 등록 버튼
- 테이블 `vehicleListTable`

### 핵심 로직

- `PENDING`이면 승인 버튼 표시
- `APPROVED`이면 수정 버튼 표시
- 삭제 기능 제공

즉 차량 컬렉션이 단순 장비 목록이 아니라 **로그인 계정 정보 + 운행 주체 정보**까지 같이 품고 있다.

---

## 5-4. 현장 관리 뷰

### 구성

- 검색 `siteSearchInput`
- 현장 추가 버튼
- 테이블 `siteListTable`

### 중요 포인트

현장 테이블에 안전사항 컬럼이 있다.

```html
<th>안전사항</th>
```

그리고 `renderSiteUI()`에서 안전사항이 있으면 경고 아이콘 비슷하게 `⚠️`를 표시한다.

이건 데이터 유무를 즉시 확인하게 만드는 좋은 UX다.

---

## 5-5. 운행일지 뷰

### 구성

- 날짜 필터 `logDateSearch`
- 오늘 버튼
- 송장 필터 `logInvoiceFilter`
- 수기 등록 버튼
- 엑셀 다운로드 버튼
- 테이블 `logListTable`

### 의도

배차는 실시간 운영용이고,
운행일지는 정산/이력 관리용이다.

그래서 둘을 분리했다.

---

## 6. 모달 구조 해설

이 파일의 핵심은 사실 테이블보다 모달이다.

### 모달 목록

- `dispatchModal`: 단건 배차
- `quickDispatchModal`: 빠른 연속 입력
- `excelUploadModal`: 엑셀 업로드
- `siteModal`: 현장 등록/수정
- `editVehicleModal`: 차량 등록/수정
- `logEditModal`: 운행일지 등록/수정
- `invoiceModal`: 송장 이미지 보기

### 공부 포인트

모달 id를 명확히 주고,
열 때는 `classList.remove('hidden')`,
닫을 때는 `closeModal(id)`를 쓰는 구조다.

이 패턴은 단순하지만 유지보수성이 꽤 좋다.

---

## 7. Firebase 초기화 구조

핵심 라인은 아래 흐름이다.

```js
import { initializeApp } from "firebase-app.js";
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, ... } from "firebase-firestore.js";

const firebaseConfig = { ... };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
```

### 학습 포인트

- `initializeApp`: Firebase 프로젝트 연결 시작
- `getFirestore(app)`: Firestore DB 핸들 획득
- 이후 `db`를 모든 컬렉션 작업에서 공용 사용

### 솔직한 보안 메모

Firebase 웹 config는 프론트에 노출될 수 있다.
진짜 보안은 키 숨김이 아니라 **Firestore Rules**에 달려 있다.

반대로,
관리자 비밀번호를 HTML 안에 하드코딩하는 건 별개 문제고 위험하다.
그건 보안 규칙으로도 막기 어렵다.

---

## 8. 전역 상태 변수 구조

관리자 콘솔은 데이터를 배열 4개로 들고 간다.

```js
let vData = [], sData = [], dData = [], lData = [];
```

각 의미:

- `vData`: vehicles
- `sData`: sites
- `dData`: dispatches
- `lData`: logs

이 구조는 심플하다.

Firestore에서 snapshot을 받으면 이 배열을 갈아끼우고, 각 렌더 함수가 다시 그림을 그린다.

즉 상태관리 라이브러리 없이 직접 메모리 배열로 돌리는 방식이다.

---

## 9. debounce 기법

이 파일에는 `debounce()` 유틸리티가 있다.

### 왜 필요하나

버튼을 연속 클릭하면
- 중복 저장
- 중복 배차
- 중복 등록

이 생긴다.

그래서 저장/전송 함수 앞에 debounce를 걸어 중복 실행을 줄인다.

이건 작은 디테일 같아 보여도 실제 서비스에서는 중요하다.

---

## 10. 데이터 로딩의 핵심: `loadAllData()`

이 함수가 관리자 콘솔의 심장이다.

### 구조

- `vehicles`를 `onSnapshot()`으로 구독
- `sites`를 `onSnapshot()`으로 구독
- `dispatches`를 `onSnapshot()`으로 구독
- `logs`는 날짜 필터형이므로 별도 `loadLogData()`에서 처리

### 결과

각 컬렉션이 변할 때마다,

- 배열 업데이트
- UI 재렌더링
- 드롭다운 갱신
- 지도 갱신
- 대시보드 통계 갱신

이 연쇄적으로 일어난다.

즉 관리자는 새로고침 없이도 최신 상태를 본다.

---

## 11. 렌더 함수 패턴

## 11-1. `renderVehicleUI()`

역할:
- 차량 검색 필터 적용
- 승인 대기 badge 표시
- 차량 테이블 렌더링

학습 포인트:
- `PENDING`이면 승인 버튼
- 그 외는 수정 버튼
- 상태값에 따라 버튼 종류가 바뀌는 조건부 렌더링

## 11-2. `renderSiteUI()`

역할:
- 현장 검색 필터
- 좌표 표시
- 안전사항 존재 여부 표시

핵심 기법:
- `s.safetyNotes ? '⚠️' : '-'`

## 11-3. `renderDispatchUI()`

역할:
- 배차 상태 필터 적용
- 상태명을 한글로 매핑
- 취소 버튼 제공

상태 매핑 패턴:

```js
const statusMap = {
  WAITING: '대기중',
  LOADING: '상차중',
  MOVING: '이동중',
  UNLOADING: '하차중',
  DONE: '완료'
};
```

## 11-4. `renderLogUI()`

역할:
- 운행일지 목록 출력
- 송장 제출 여부 필터
- 송장 사진 보기 버튼 조건부 표시

---

## 12. 현장 저장 로직 `saveSite()`

이 기능은 이번 버전에서 특히 중요하다.

### 저장 데이터

```js
const data = { name, address, lat, lng, safetyNotes: safetyNotes || '' };
```

여기서 핵심은 `safetyNotes`다.

즉 현장 데이터에 안전/준수사항을 붙여두고,
나중에 배차 생성과 운전자 앱에서 다시 활용한다.

### 좋은 점

- 현장 관리와 안전 관리가 하나의 데이터 구조로 통합됨
- 중복 입력 줄어듦
- 배차마다 다시 적지 않아도 됨

---

## 13. 단건 배차 전송 `sendDispatch()`

이 함수는 기본형 배차 생성이다.

### 처리 흐름

1. 차량 선택
2. 상차지/하차지 선택
3. `sData`에서 현장 정보 조회
4. 좌표/안전사항까지 포함한 dispatch 문서 생성
5. Firestore `dispatches`에 저장

### 핵심 포인트

```js
startSafetyNotes: sSite.safetyNotes || '',
endSafetyNotes: eSite.safetyNotes || '',
```

이건 엄청 중요하다.

왜냐하면 배차 시점에 현장의 안전사항을 함께 복사해서 배차 문서에 넣어두면,
나중에 현장 마스터가 바뀌어도 당시 배차 기준 안전사항을 유지할 수 있기 때문이다.

실무적으로도 이 방식이 꽤 유용하다.

---

## 14. 빠른 연속 입력 구조

핵심 함수:

- `openQuickDispatchModal()`
- `onQuickVehicleChange()`
- `addQuickDispatchRow()`
- `removeQuickDispatchRow()`
- `sendQuickDispatches()`

### 핵심 아이디어

차량을 먼저 하나 고정하고,
그 차량에 여러 배차를 줄줄이 입력하게 만든다.

### 왜 유용한가

현실에서 같은 차가
- A 상차 → B 하차
- C 상차 → D 하차
- E 상차 → F 하차

처럼 연속 작업을 하는 경우가 많다.

매번 차량을 다시 고르는 건 비효율적이다.
그래서 차량은 상단에서 한 번만 고르고,
행별로 출발/도착/품목만 입력하게 만든 것이다.

### UI 기법

행을 동적으로 HTML 문자열로 만들어 삽입한다.

```js
document.getElementById('quickDispatchRows').insertAdjacentHTML('beforeend', rowHTML);
```

이건 가볍고 빠르지만,
컴포넌트 분리가 없으므로 나중에 행이 더 복잡해지면 관리가 힘들어진다.

---

## 15. 엑셀 업로드 구조

핵심 함수:

- `downloadExcelTemplate()`
- `openExcelUploadModal()`
- `handleExcelFile()`
- `handleExcelUpload()`
- `validateExcelData()`
- `sendBulkDispatches()`

### 처리 단계

1. 파일 선택/드래그드롭
2. 확장자 검사
3. 파일 크기 검사
4. `FileReader`로 읽기
5. `XLSX.read()`로 workbook 생성
6. 첫 번째 시트를 배열로 변환
7. 행별 검증
8. 문제 없으면 `excelData` 배열에 저장
9. 전송 버튼 활성화
10. 반복문으로 Firestore에 addDoc
11. 진행률 UI 업데이트

### 검증 포인트

- 차량번호 누락 여부
- 차량 승인 여부
- 상차지 등록 여부
- 하차지 등록 여부
- 최대 500행 제한

### 아주 중요한 실무 포인트

엑셀은 “입력의 편의성”은 좋지만 **데이터 오염의 시작점**이 되기 쉽다.
그래서 검증을 반드시 붙여야 한다.
이 코드가 그걸 기본적으로 하고 있다.

---

## 16. 드래그 앤 드롭 구현 기법

```js
dropZone.addEventListener('dragover', ...)
dropZone.addEventListener('dragleave', ...)
dropZone.addEventListener('drop', ...)
```

이건 작은 기능이지만 사용자 체감 품질을 많이 올린다.

학습 포인트:
- 기본 이벤트 막기 `e.preventDefault()`
- CSS 클래스 `dragover` 토글
- 드롭된 파일을 기존 업로드 처리 함수로 넘기기

즉 입력 방식만 다르고, 실제 처리 파이프라인은 재사용한다.
이게 좋은 구조다.

---

## 17. 차량 등록/승인 구조

핵심 함수:

- `openAddVehicleModal()`
- `editVehicle()`
- `saveVehicleData()`
- `approveVehicle()`
- `deleteVehicle()`

### 설계 특징

차량 문서 id를 신규 등록 시 차량번호로 쓰는 구조가 섞여 있다.
즉 사용자 가입 시에도 차량번호를 키처럼 쓰고, 관리자 등록 시도 그 흐름을 따른다.

장점:
- 찾기 쉽다

단점:
- 차량번호 변경이 까다롭다
- id와 데이터 변경 정책이 뒤섞일 수 있다

공부 포인트로는 좋지만, 장기 운영에서는 별도 uid 전략도 고려할 만하다.

---

## 18. 운행일지 구조

핵심 함수:

- `loadLogData()`
- `renderLogUI()`
- `openLogModal()`
- `saveLogData()`
- `downloadLogExcel()`

### 특징

- 날짜 기준 필터
- 송장 제출 여부 필터
- 수기 등록 가능
- 엑셀 정산 자료 추출 가능

즉 운영 데이터가 단순 조회로 끝나지 않고, 실제 정산 업무까지 연결되게 설계되어 있다.

---

## 19. 지도 처리 구조

핵심 함수:

- `initMap()`
- `updateMapMarkers()`

지도는 대시보드에서만 쓰인다.
관리자는 차량 위치를 지도에서 확인할 수 있다.

학습 포인트:
- 지도 인스턴스를 전역으로 들고 가는 방식
- 차량 데이터 갱신 시 마커 다시 그림
- Firestore 실시간 위치와 지도 시각화 연결

이건 관제 시스템에서 매우 전형적인 패턴이다.

---

## 20. 이 파일에서 배워야 할 제작 기법 요약

### UI 제작 기법

- Tailwind 기반 대시보드 레이아웃
- 모달 중심 UX
- sticky table header
- scroll 영역 분리
- 상태 badge 시각화

### 데이터 처리 기법

- Firestore 실시간 구독
- 배열 메모리 캐싱
- 렌더 함수 분리
- 조건부 버튼/상태 텍스트 매핑
- 엑셀 검증 후 저장

### 실무 기법

- 진행률 표시
- debounce
- confirm/alert 기반 간단 보호 장치
- 입력값 검증
- CRUD 공통 패턴화

---

## 21. 개선하면 더 좋아질 점

솔직하게 보면 개선 포인트도 많다.

### 1. 파일 분리

지금은 한 파일이 너무 크다.
최소한 아래처럼 분리하면 더 좋다.

- `control.html`
- `control.css`
- `control.firebase.js`
- `control.dispatch.js`
- `control.sites.js`
- `control.vehicles.js`
- `control.logs.js`

### 2. 인증 강화

- Firebase Auth 도입
- 관리자 권한 custom claims 도입
- 하드코딩 비밀번호 제거

### 3. Firestore Rules 정교화

- 관리자만 `sites`, `dispatches` 쓰기 허용
- 운전자는 자기 차량 문서만 수정 가능
- logs는 자기 차량만 읽기/쓰기 가능

### 4. 에러 UI 개선

지금은 대부분 `alert()` 기반이다.
실서비스라면 toast/snackbar가 낫다.

### 5. 배치 쓰기

대량 배차는 `writeBatch`나 `bulk writer` 계열로 바꾸면 더 안정적일 수 있다.

---

## 22. 공부용 실습 과제 추천

이 파일을 더 잘 이해하려면 아래 실습을 해보는 게 좋다.

### 실습 1
현장 테이블에 “전화번호” 컬럼 추가

### 실습 2
배차 목록에 “생성 시각” 컬럼 추가

### 실습 3
엑셀 업로드 템플릿에 “중량” 컬럼 추가

### 실습 4
빠른 연속 입력 행에 “중량” 입력칸 추가

### 실습 5
배차 취소 대신 상태를 `CANCELLED`로 보존하도록 수정

이런 식으로 직접 손대보면 구조가 빨리 익는다.

---

## 23. 한 줄 총평

`control_v2.2.html`은

**“순수 HTML + Firebase + 외부 SDK만으로 실제 운영형 관리자 콘솔을 만드는 방법”**

을 꽤 현실적으로 보여주는 파일이다.

완벽하게 세련된 구조는 아니지만,
오히려 그래서 공부 가치가 있다.

왜냐하면 실제 현장에서는 처음부터 완벽한 구조보다,
**돌아가는 구조를 먼저 만들고 그 다음에 정리**하는 경우가 많기 때문이다.

이 파일은 바로 그 과정을 아주 잘 보여준다.
