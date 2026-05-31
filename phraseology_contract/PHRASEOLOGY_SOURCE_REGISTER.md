# Phraseology Source Register

작성일: 2026-05-09

## 목적

표준관제용어와 조종사 readback template을 만들 때 어떤 문서를 우선할지 고정한다.

이 문서는 원문 phrase 전체를 복사하는 문서가 아니다. 출처 권한과 적용 순서를 정하는 register다.

## 권한 순서

| 우선순위 | 출처 | 역할 |
|---:|---|---|
| 1 | 항공교통업무 운영 및 관리규정 | 표준용어 사용 의무와 준용 순서 |
| 2 | 항공교통관제절차 | 국내 항공교통관제 phraseology/절차의 1차 기준 |
| 3 | 무선통신매뉴얼 | 무선통신, 복창, 숫자/문자 송신, standard words 기준 |
| 4 | ICAO Doc 4444 PANS-ATM | 국내 문서에 없는 관제절차/phraseology 보조 기준 |
| 5 | ICAO Doc 9432 Manual of Radiotelephony | radiotelephony phraseology 보조 기준 |
| 6 | FAA JO 7110.65 Air Traffic Control | 국내/ICAO에 없는 항목의 마지막 보조 참고 |
| 7 | 제주 접근관제소 SOP / Tacit Notes | 제주 로컬 적용, source override가 아니라 local supplement |

## 공식 출처 메모

### 항공교통업무 운영 및 관리규정

- 국가법령정보센터: https://law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000227474
- 확인 기준: 시행 2023-08-02, 국토교통부고시 제2023-458호
- 사용 이유: 표준용어는 항공교통관제절차를 우선하고, 없으면 무선통신매뉴얼/ICAO/FAA 순으로 보는 구조를 제공한다.

### 항공교통관제절차

- 국가법령정보센터: https://law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000214619
- 확인 기준: 시행 2022-09-22, 국토교통부고시 제2022-534호
- 사용 이유: 국내 관제 phraseology와 관제절차의 1차 기준이다.

### 무선통신매뉴얼

- 국가법령정보센터: https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000205196
- 확인 기준: 시행 2021-10-07, 국토교통부고시 제2021-1140호
- 사용 이유: 무선통신 절차, readback, 호출부호, 숫자 송신 등 LLM 조종사 응답에 필요한 기준이다.

### 항공안전법 시행규칙 제169조

- 국가법령정보센터 조문정보: https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000601592
- 사용 이유: 10000 ft 미만 IAS 250 kt 제한과 예외 rule의 법령 근거다.
- 주의: 시뮬레이터에서는 10000 ft 도달 후 강제 감속이 아니라, 10000 ft 도달 전에 감속 완료하도록 예측 감속 로직으로 구현해야 한다.

### ICAO Doc 4444

- ICAO PANS-ATM reference: https://applications.icao.int/tools/ATMiKIT/story_content/external_files/story_content/external_files/DOC%204444_PANS%20ATM_en.pdf
- 사용 이유: 국내 문서에 없는 관제절차와 phraseology의 국제 보조 기준이다.

### ICAO Doc 9432

- ICAO Store: https://store.icao.int/en/manual-of-radiotelephony-doc-9432
- 확인 기준: Manual of Radiotelephony, Doc 9432, 4th Edition, 2007
- 사용 이유: radiotelephony phraseology와 pilot/controller exchange의 보조 기준이다.

### FAA JO 7110.65

- FAA official order page: https://www.faa.gov/regulations_policies/orders_notices/index.cfm/go/document.current%20/documentNumber/7110.65
- 확인 기준: JO 7110.65BB, issued 2025-02-20, active
- 사용 이유: 국내/ICAO 문서로 결정하기 어려운 항목의 마지막 보조 참고다.

## 적용 원칙

1. 국내 고시가 있으면 국내 고시를 우선한다.
2. 국내 고시에 없는 phrase는 ICAO 문서를 먼저 본다.
3. FAA 문서는 한국 기준을 대체하지 않는다.
4. 제주 SOP는 local supplement이며 상위 표준을 덮어쓰지 않는다.
5. LLM 조종사 에이전트는 이 register 밖의 표현을 임의로 표준용어처럼 확장하지 않는다.

