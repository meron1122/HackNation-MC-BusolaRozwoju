// Baza wiedzy asystenta: Q&A z rozporządzeń 2015 i 2016 oraz poradników KPRM (etapy/00-analiza-domeny/baza-qa.md w repo projektu).
// Każda odpowiedź ma źródło. Generowane skryptem – nie edytować ręcznie.
export type QA = { id: string; q: string; a: string; src: string }

export const QA_ITEMS: QA[] = [
 {
  "id": "A-01",
  "q": "Kto podlega ocenie okresowej i kto ją przeprowadza?",
  "a": "Ocenie podlega urzędnik służby cywilnej i pracownik służby cywilnej zatrudniony na czas nieokreślony. Ocenia bezpośredni przełożony, a kierujący komórką nie uczestniczy, chyba że sam jest bezpośrednim przełożonym. Nie podlegają jej m.in. osoby na wyższych stanowiskach, osoby na umowie na czas określony 12 miesięcy (te mają pierwszą ocenę) i osoby na innych umowach na czas określony, w tym na zastępstwo.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 2 ust. 1; Poradnik KPRM 2016, s. 7; ustawa o służbie cywilnej, art. 81 ust. 1 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-02",
  "q": "Który arkusz wybrać dla naczelnika wydziału albo kierownika zespołu?",
  "a": "Arkusz B, bo służy do oceny osoby, której praca polega na bezpośrednim kierowaniu pracownikami, jeśli nie jest kierownikiem urzędu. Decyduje faktyczne kierowanie ludźmi, a nie nazwa stanowiska. Kierownik urzędu dostaje arkusz A, pozostali arkusz C.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 3 ust. 2–4; Poradnik KPRM 2016, s. 18–19."
 },
 {
  "id": "A-03",
  "q": "Ile kryteriów dodatkowych mogę wybrać i czy muszę?",
  "a": "Od 0 do 3, wybór nie jest obowiązkowy. Wybierasz je z wykazu w zał. nr 1, jeśli uzasadnia to charakter obowiązków z opisu stanowiska, i mają to być kryteria najistotniejsze. Rezygnacja z kryteriów dodatkowych ma sens, gdy zadania są ogólne i jednorodne.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 2 ust. 2–3, § 5 ust. 2; Poradnik KPRM 2016, s. 21–22."
 },
 {
  "id": "A-04",
  "q": "Czy dla naczelnika mogę wybrać „zarządzanie strategiczne” jako kryterium dodatkowe? Czy mogę dodać „komunikację”?",
  "a": "„Zarządzanie strategiczne” tak, bo w arkuszu B nie jest obowiązkowe, a przykładowy arkusz B w Poradniku ma je właśnie jako dodatkowe. „Komunikacji” nie, bo jest już kryterium obowiązkowym arkusza B. Zakaz powtarzania kryteriów obowiązkowych wynika z konstrukcji arkusza, przepis nie mówi tego wprost.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 2 ust. 2, § 4 ust. 2, zał. 1; Poradnik KPRM 2016, s. 19, 22, zał. 2 (s. 39)."
 },
 {
  "id": "A-05",
  "q": "Co muszę omówić na rozmowie rozpoczynającej?",
  "a": "Cztery rzeczy: główne obowiązki z opisu stanowiska, kryteria obowiązkowe i dodatkowe, swoje oczekiwania co do sposobu spełniania kryteriów oraz cele i sposób ich realizacji, jeśli ich wyznaczenie jest uzasadnione. Po rozmowie wpisujesz do części I kryteria dodatkowe i termin sporządzenia oceny.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 5 ust. 1 i 3."
 },
 {
  "id": "A-06",
  "q": "Ile mam czasu na rozmowę rozpoczynającą i wyznaczenie kryteriów?",
  "a": "30 dni od dnia sporządzenia poprzedniej oceny na piśmie albo od zatrudnienia na czas nieokreślony, a po ocenie negatywnej tylko 7 dni od jej sporządzenia. Liczysz od daty sporządzenia oceny, a nie od daty „DO” w arkuszu, bo przy ocenie po zmianie stanowiska „DO” to ostatni dzień na starym stanowisku. Termin biegnie od dnia następnego; jeśli koniec wypada w niedzielę lub święto, przesuwa się na kolejny dzień (sobota do potwierdzenia).",
  "src": "Rozporządzenie PRM z 4.04.2016, § 7 pkt 1–2, zał. 2–4 (przypis do daty „DO”); Poradnik KPRM 2016, s. 9; Kodeks cywilny, art. 111 i 115 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-07",
  "q": "Co potwierdza podpis ocenianego w części I i co dalej z arkuszem?",
  "a": "Oceniany potwierdza podpisem przeprowadzenie rozmowy rozpoczynającej oraz zapoznanie się z kryteriami i terminem sporządzenia oceny. Oba podpisy muszą się zmieścić w terminie 30 albo 7 dni. Potem oryginał niezwłocznie trafia do akt osobowych, a kopię części I doręczasz ocenianemu.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 6 ust. 2–3, § 7."
 },
 {
  "id": "A-08",
  "q": "Czy mogę w części I wpisać dowolny termin sporządzenia oceny?",
  "a": "Nie. Termin wynika z cyklu 24 miesięcy od sporządzenia poprzedniej oceny (albo z cyklu 6 miesięcy po ocenie negatywnej). Zmienić go możesz tylko w trybie art. 81 ust. 8 ustawy, gdy od ostatniej oceny minęło ponad 6 miesięcy, a przedłuża się sam przy nieobecności dłuższej niż miesiąc.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 5 ust. 3; Poradnik KPRM 2016, s. 8, 11, 15; ustawa o służbie cywilnej, art. 81 ust. 4, 7–9 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-09",
  "q": "Czy okres oceny trwa zawsze równe 24 miesiące?",
  "a": "Nie. Ocenę sporządza się co 24 miesiące, ale okres podlegania ocenie trwa od dnia zapoznania z kryteriami do dnia sporządzenia oceny. W praktyce to zwykle około 23 miesięcy.",
  "src": "Poradnik KPRM 2016, s. 8, 23–24; Rozporządzenie PRM z 4.04.2016, zał. 2–4 (przypisy do dat „OD” i „DO”); ustawa o służbie cywilnej, art. 81 ust. 4 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-10",
  "q": "Pracownica była 2 miesiące na zwolnieniu lekarskim. Czy termin oceny się zmienia?",
  "a": "W zwykłym cyklu 24-miesięcznym tak: usprawiedliwiona nieobecność trwająca nieprzerwanie dłużej niż miesiąc przedłuża termin o cały czas nieobecności, automatycznie i bez decyzji oceniającego. Wyjątek: w cyklu 6-miesięcznym po ocenie negatywnej termin się nie przedłuża, a ocenę sporządzasz po powrocie pracownicy, gdy da się przeprowadzić rozmowę oceniającą. Pisma nie musisz wysyłać, ale warto ją poinformować.",
  "src": "Poradnik KPRM 2016, s. 11–14; ustawa o służbie cywilnej, art. 81 ust. 7 i 9 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-11",
  "q": "Pracownik miał 3 tygodnie urlopu, a zaraz potem 2 tygodnie L4. Czy to nieobecność „dłuższa niż miesiąc”?",
  "a": "Tak, jeśli była ciągła. Zmiana przyczyny nieobecności jej nie przerywa, podobnie jak dni wolne według rozkładu czasu pracy. Termin przedłuża się o łączną liczbę dni nieobecności.",
  "src": "Poradnik KPRM 2016, s. 12."
 },
 {
  "id": "A-12",
  "q": "Termin oceny się zmienił. Czy muszę zawiadomić pracownika na piśmie?",
  "a": "Tylko gdy zmieniasz termin w trybie art. 81 ust. 8 ustawy: wtedy niezwłocznie zawiadamiasz ocenianego na piśmie, a kopię pisma dołączasz do arkusza. Przy przedłużeniu z powodu nieobecności (art. 81 ust. 7) i przy ocenie po zmianie stanowiska (art. 81 ust. 6) pismo nie jest wymagane. Dobrą praktyką jest jednak poinformowanie pracownika.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 8; Poradnik KPRM 2016, s. 13, 15; ustawa o służbie cywilnej, art. 81 ust. 6–8 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-13",
  "q": "Pracownik prosi o przesunięcie terminu oceny. Czy mogę się zgodzić?",
  "a": "Tak, jeśli od sporządzenia ostatniej oceny minęło ponad 6 miesięcy; decyzję podejmuje oceniający i musi zawiadomić pracownika na piśmie (kopia do arkusza). Nie dotyczy to ponownej oceny po ocenie negatywnej, bo tego terminu nie można zmienić. Ta sama podstawa obejmuje zmianę oceniającego i przewidywaną dłuższą nieobecność ocenianego albo oceniającego.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 8; Poradnik KPRM 2016, s. 14–15; ustawa o służbie cywilnej, art. 81 ust. 8 pkt 1–4 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-14",
  "q": "Pracownik zmienia stanowisko na takie z zupełnie innymi obowiązkami. Co z oceną?",
  "a": "Jeśli od ostatniej oceny minęło nie więcej niż 6 miesięcy, w ciągu 30 dni od zmiany ponownie przeprowadzasz rozmowę i ustalasz kryteria, a termin oceny się nie zmienia. Jeśli minęło więcej niż 6 miesięcy, ocenę sporządza się nie wcześniej niż 7 dni przed zmianą i nie później niż 30 dni po niej. Sporządza ją dotychczasowy przełożony za okres do ostatniego dnia na starym stanowisku.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 9 ust. 1–2, zał. 2–4 (przypis do daty „DO”); Poradnik KPRM 2016, s. 10–11, 17; ustawa o służbie cywilnej, art. 81 ust. 6 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-15",
  "q": "Oddelegowałem pracownika na 2 miesiące do innego wydziału. Czy to zmiana stanowiska?",
  "a": "Nie. Powierzenie innej pracy na okres do 3 miesięcy w roku kalendarzowym nie jest zmianą stanowiska. Nie rodzi więc obowiązku oceny.",
  "src": "Poradnik KPRM 2016, s. 10; Kodeks pracy, art. 42 § 4 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-16",
  "q": "Zmienia się oceniający w trakcie okresu oceny. Co z kryteriami i terminem?",
  "a": "Nowy oceniający sporządza ocenę według wcześniej wybranych kryteriów i w dotychczasowym terminie. Jeśli od ostatniej oceny minęło ponad 6 miesięcy, dotychczasowy przełożony może wcześniej sporządzić ocenę, a nowy zacznie wtedy cykl z nowymi kryteriami. Bez takiej oceny nowy oceniający powinien porozmawiać z każdym pracownikiem i ponownie omówić obowiązki, kryteria, oczekiwania i cele.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 9 ust. 3; Poradnik KPRM 2016, s. 15, 17; ustawa o służbie cywilnej, art. 81 ust. 8 pkt 1 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-17",
  "q": "O czym rozmawiam na rozmowie oceniającej?",
  "a": "O trzech sprawach: głównych obowiązkach w okresie oceny i sposobie ich realizacji na tle kryteriów, realizacji celów (jeśli były wyznaczone) oraz kierunkach rozwoju i potrzebach w zakresie podnoszenia kwalifikacji. Wnioski z rozmowy bierzesz pod uwagę przy sporządzaniu oceny.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 10, § 11 ust. 2."
 },
 {
  "id": "A-18",
  "q": "Kiedy przeprowadzić rozmowę oceniającą?",
  "a": "Przed sporządzeniem oceny na piśmie. Przepisy nie podają dokładnego terminu, ale rozmowa powinna być blisko daty sporządzenia oceny; ten sam dzień jest dopuszczalny (tak jest w przykładowym arkuszu B). Rozmowa powinna być dialogiem, a nie odczytaniem gotowej oceny.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 10; Poradnik KPRM 2016, s. 20, 25, zał. 2."
 },
 {
  "id": "A-19",
  "q": "Od czego zacząć wystawianie ocen cząstkowych?",
  "a": "Od 5 pkt („na poziomie oczekiwań”, czyli optymalne wykonywanie zadań). Potem podwyższasz lub obniżasz ocenę na podstawie faktów z całego okresu i oczekiwań przekazanych na rozmowie rozpoczynającej. Nie oceniaj na podstawie ogólnego wrażenia ani ostatnich tygodni.",
  "src": "Poradnik KPRM 2016, s. 23–24, 26."
 },
 {
  "id": "A-20",
  "q": "Jak wyliczyć wynik oceny okresowej?",
  "a": "Za każde kryterium przyznajesz 1, 3, 5, 7 albo 9 pkt i liczysz średnią arytmetyczną. Średnia daje poziom: od 1 do 2 pkt znacznie poniżej, powyżej 2 do 4 poniżej, powyżej 4 do 6 na poziomie, powyżej 6 do 8 powyżej, powyżej 8 do 9 znacznie powyżej oczekiwań. Ocena jest pozytywna przy poziomie co najmniej „na poziomie oczekiwań” i braku jakiejkolwiek oceny 1 pkt.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 11 ust. 1 pkt 1–4."
 },
 {
  "id": "A-21",
  "q": "Średnia wyszła 6,00 (albo 4,00). Jaki to poziom?",
  "a": "6,00 to „na poziomie oczekiwań”, bo przedział obejmuje „powyżej 4 do 6 pkt”, a „powyżej oczekiwań” zaczyna się od wartości większej niż 6. 4,00 to „poniżej oczekiwań”, więc ocena jest negatywna. Granica przedziału zawsze należy do niższego poziomu.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 11 ust. 1 pkt 2 i 4; Poradnik KPRM 2016, s. 27, zał. 1 (s. 37)."
 },
 {
  "id": "A-21b",
  "q": "Średnia ocen cząstkowych wynosi dokładnie 4,00 i nie ma oceny 1 pkt. Czy średnia 4,0 to ocena pozytywna?",
  "a": "Nie. Średnia 4,00 mieści się w przedziale „powyżej 2 do 4 pkt”, czyli „poniżej oczekiwań”, a ocena jest pozytywna dopiero od poziomu „na poziomie oczekiwań”. Dlatego przy 4,00 ocena jest negatywna, nawet bez żadnej oceny 1 pkt. Granica przedziału zawsze należy do niższego poziomu.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 11 ust. 1 pkt 2 lit. b–c i pkt 4; Poradnik KPRM 2016, s. 27."
 },
 {
  "id": "A-22",
  "q": "Średnia wyszła 5,8 (albo 8,1), ale za jedno kryterium dałem 1 pkt. Jaka to ocena?",
  "a": "Negatywna. Każda ocena cząstkowa „znacznie poniżej oczekiwań” (1 pkt) przesądza o ocenie negatywnej bez względu na średnią. Uzasadnienie jest wtedy obowiązkowe.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 11 ust. 1 pkt 3–4, § 11 ust. 3; Poradnik KPRM 2016, s. 27–28."
 },
 {
  "id": "A-23",
  "q": "Czy muszę pisać uzasadnienie oceny?",
  "a": "Przy ocenie negatywnej tak, przy pozytywnej możesz, ale nie musisz. Uzasadnienie może być ogólne albo odnosić się do wszystkich lub tylko niektórych ocen cząstkowych. Poradnik zaleca je także przy ocenie pozytywnej, bo jest informacją zwrotną i dowodem przy decyzjach kadrowych i w sądzie.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 11 ust. 3–4, zał. 2–4 (przypis do pola „Uzasadnienie”); Poradnik KPRM 2016, s. 28."
 },
 {
  "id": "A-24",
  "q": "Czy wnioski do IPRZ są obowiązkowe przy dobrej ocenie i co w nich wpisać?",
  "a": "Tak, wpisanie wniosków do indywidualnego programu rozwoju zawodowego jest częścią sporządzenia każdej oceny, bez względu na wynik. Wskaż kierunki rozwoju, obszary wiedzy i umiejętności do doskonalenia oraz formy i metody (np. „Język angielski – szkolenie, literatura branżowa”). Uwzględnij obecne i przyszłe zadania, oczekiwania pracownika i obszary szybko się zmieniające, np. prawo i IT.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 11 ust. 1 pkt 5; Poradnik KPRM 2016, s. 29, 34, zał. 1 i 3; ustawa o służbie cywilnej, art. 81 ust. 5 i art. 108 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-25",
  "q": "Kiedy mogę złożyć wniosek o kolejny stopień służbowy?",
  "a": "Tylko dla urzędnika służby cywilnej i tylko przy ocenie pozytywnej, jako umotywowany wniosek w części III arkusza. Wniosek jest fakultatywny, a decyzję podejmuje dyrektor generalny. Dla pracownika służby cywilnej i bez wniosku części III się nie drukuje.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 11 ust. 5, zał. 3–4 (przypis 18); Poradnik KPRM 2016, s. 29–30; ustawa o służbie cywilnej, art. 89 ust. 1 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-26",
  "q": "Urzędnik ma drugą z rzędu ocenę „powyżej oczekiwań”. Muszę składać wniosek o stopień?",
  "a": "Nie. Urzędnik, który od ostatniego stopnia uzyskał dwie kolejne pozytywne oceny na jednym z dwóch najwyższych poziomów, otrzymuje kolejny stopień z mocy prawa w ciągu 30 dni od zapoznania się z oceną. Dwie oceny muszą być pozytywne, więc wysoka średnia z oceną 1 pkt się nie liczy.",
  "src": "Poradnik KPRM 2016, s. 30 (przypis 8), s. 34; ustawa o służbie cywilnej, art. 89 ust. 2 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-27",
  "q": "Pracownik dostał ocenę negatywną. Co dalej i kiedy?",
  "a": "W ciągu 7 dni od sporządzenia oceny negatywnej przeprowadzasz rozmowę rozpoczynającą, ustalasz kryteria (mogą być nowe) i termin, a pracownik to podpisuje. Ponowną ocenę sporządzasz niezwłocznie po upływie 6 miesięcy od dnia zapoznania się z oceną negatywną (zapoznanie 15.02.2015 → ocena 16.08.2015); termin nie przedłuża się z powodu nieobecności i nie można go zmienić, a przy obiektywnej przeszkodzie wydłuża się faktycznie do dnia, w którym da się przeprowadzić rozmowę oceniającą. Urzędnika, który dostanie drugą kolejną ocenę negatywną, czeka rozwiązanie stosunku pracy.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 7 pkt 2; Poradnik KPRM 2016, s. 13–14, 34; ustawa o służbie cywilnej, art. 81 ust. 9, art. 71 ust. 1 pkt 1 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-28",
  "q": "Czy ponowna ocena po ocenie negatywnej może zawierać wniosek o stopień?",
  "a": "Tak. To nowa ocena, a nie kontynuacja poprzedniej. Może być pozytywna, zawierać wniosek o stopień i liczyć się jako pierwsza z dwóch ocen potrzebnych do stopnia z mocy prawa.",
  "src": "Poradnik KPRM 2016, s. 35; ustawa o służbie cywilnej, art. 89 ust. 2 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-29",
  "q": "Do kogo oceniany składa sprzeciw?",
  "a": "W arkuszach B i C do dyrektora generalnego urzędu, a w urzędzie, w którym przepisy nie przewidują stanowiska dyrektora generalnego, do kierownika urzędu. W arkuszu A adresata wpisuje się w pouczeniu (w przykładzie z Poradnika jest to organ wojewódzki). Sam wakat na stanowisku dyrektora generalnego nie zmienia adresata.",
  "src": "Rozporządzenie PRM z 4.04.2016, zał. 3–4 (pouczenie i przypis 17), zał. 2 (pouczenie); Poradnik KPRM 2016, zał. 1 (s. 38); ustawa o służbie cywilnej, art. 83 ust. 1 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-30",
  "q": "Ile jest czasu na sprzeciw i jego rozpatrzenie?",
  "a": "Oceniany ma 7 dni od dnia zapoznania się z oceną. Sprzeciw rozpatruje się w 14 dni od wniesienia, a zdaniem Poradnika w tym samym terminie trzeba zmienić albo ponownie sporządzić ocenę. Potem oceniany ma 14 dni na odwołanie do sądu pracy, liczone od doręczenia decyzji albo od upływu terminu na rozpatrzenie sprzeciwu.",
  "src": "Poradnik KPRM 2016, s. 32–33; ustawa o służbie cywilnej, art. 83 ust. 1 i 3 oraz przepis o odwołaniu do sądu pracy, numer ustępu nieznany (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-31",
  "q": "Pracownik złożył sprzeciw. Czy dyrektor generalny może obniżyć mu ocenę?",
  "a": "Nie. Uwzględnienie sprzeciwu oznacza zmianę albo ponowne sporządzenie oceny, a obniżenie oceny lub któregokolwiek jej elementu byłoby niezgodne z prawem; to wykładnia Poradnika, bo ustawa mówi wprost tylko „zmienia się albo sporządza po raz drugi”. Od oceny sporządzonej po raz drugi przysługuje ponowny sprzeciw.",
  "src": "Poradnik KPRM 2016, s. 32; ustawa o służbie cywilnej, art. 83 ust. 4 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "A-32",
  "q": "Czy przy toczącym się sprzeciwie mam czekać z nowym cyklem oceny?",
  "a": "Nie. Sprzeciw i sprawa w sądzie pracy nie wstrzymują nowego cyklu. Rozmowę rozpoczynającą przeprowadzasz w 30 dni od sporządzenia oceny, a jeśli ocena była negatywna, w 7 dni.",
  "src": "Rozporządzenie PRM z 4.04.2016, § 7; Poradnik KPRM 2016, s. 33."
 },
 {
  "id": "A-33",
  "q": "Pracownik ma umowę na zastępstwo. Czy go oceniam okresowo?",
  "a": "Nie. Umowy na czas określony, w tym na zastępstwo, nie podlegają ocenie okresowej. Urząd może ocenić taką osobę w ramach oceny bieżącej według własnych procedur.",
  "src": "Poradnik KPRM 2016, s. 7."
 },
 {
  "id": "B-01",
  "q": "Kto podlega pierwszej ocenie?",
  "a": "Obowiązkowo osoba, która po raz pierwszy podejmuje pracę w służbie cywilnej na umowę na czas określony 12 miesięcy. Osoba zatrudniona na zastępstwo może podlegać pierwszej ocenie tylko wtedy, gdy strony tak ustalą (Poradnik zaleca pisemną zgodę pracownika i dyrektora generalnego). Nie podlega jej absolwent KSAP, który złożył wniosek o mianowanie, osoba na wyższym stanowisku ani osoba wcześniej zatrudniona w służbie cywilnej na czas nieokreślony.",
  "src": "Poradnik KPRM 2016 – pierwsza ocena, s. 6–7, 11; ustawa o służbie cywilnej, art. 35 ust. 3 i 5, art. 37 ust. 1–3 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "B-02",
  "q": "Ile mam czasu na rozmowę wstępną?",
  "a": "21 dni od dnia nawiązania stosunku pracy, a przy zastępstwie 21 dni od dnia, w którym strony ustaliły, że pracownik będzie podlegał pierwszej ocenie. Termin biegnie od dnia następnego po zatrudnieniu: przy zatrudnieniu 23.11.2015 ostatni dzień to 14.12.2015. Rozmowę prowadzi bezpośredni przełożony.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 3; Poradnik KPRM 2016 – pierwsza ocena, s. 11."
 },
 {
  "id": "B-03",
  "q": "Co muszę omówić na rozmowie wstępnej?",
  "a": "Cztery rzeczy: sposób dokonywania pierwszej oceny, główne obowiązki z opisu stanowiska i oczekiwania co do ich wykonywania, oczekiwania co do postawy, zaangażowania, postępów, relacji ze współpracownikami i terminowości (według opisów 5 elementów z zał. nr 1) oraz termin na złożenie sprawozdania.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 3 pkt 1–4, zał. 1."
 },
 {
  "id": "B-04",
  "q": "Co wpisuję do arkusza po rozmowie wstępnej i co dostaje pracownik?",
  "a": "Wpisujesz datę rozmowy wstępnej, termin na złożenie sprawozdania i okres, w którym trzeba dokonać pierwszej oceny. Oceniany podpisem potwierdza przeprowadzenie rozmowy i zapoznanie się z terminem sprawozdania. Potem przekazujesz mu kopię części I i II arkusza.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 4 ust. 2–4."
 },
 {
  "id": "B-05",
  "q": "Jak wyznaczyć termin na sprawozdanie?",
  "a": "Podajesz datę początkową i końcową okresu na złożenie sprawozdania. Okres ten musi przypadać po upływie 8 miesięcy od nawiązania stosunku pracy i zostawiać czas na rozmowę oceniającą i ocenę w ustawowym terminie. Przykład z Poradnika: okno oceny 2.05–30.07.2016, sprawozdanie 16.05–30.06.2016.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 4 ust. 1; Poradnik KPRM 2016 – pierwsza ocena, s. 8–9."
 },
 {
  "id": "B-06",
  "q": "Kiedy najwcześniej i najpóźniej mogę dokonać pierwszej oceny?",
  "a": "Nie wcześniej niż po upływie 8 miesięcy od nawiązania stosunku pracy i nie później niż miesiąc przed końcem umowy. Przy umowie 1.09.2015–31.08.2016 okno to 2.05–30.07.2016. Terminy liczy się według art. 110 i nast. Kodeksu cywilnego.",
  "src": "Poradnik KPRM 2016 – pierwsza ocena, s. 8, 10–11; ustawa o służbie cywilnej, art. 38 ust. 1 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "B-07",
  "q": "Pracownik był na zwolnieniu lekarskim i nie zdąży ze sprawozdaniem. Co robię?",
  "a": "W uzasadnionych przypadkach wyznaczasz nowy termin na sprawozdanie, przedłużając dotychczasowy o czas usprawiedliwionej nieobecności albo pracy poza miejscem pracy. Nowy termin musi pozwolić na dokonanie oceny najpóźniej miesiąc przed końcem stosunku pracy. Inaczej niż w ocenie okresowej, tu zawsze niezwłocznie zawiadamiasz pracownika na piśmie i dołączasz kopię pisma do arkusza.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 5 ust. 1, 3–4; Poradnik KPRM 2016 – pierwsza ocena, s. 9–10."
 },
 {
  "id": "B-08",
  "q": "Pracownik był nieobecny ponad 3 miesiące. Czy umowa 12-miesięczna się przedłuża?",
  "a": "Nie automatycznie: dyrektor generalny może ją przedłużyć na wniosek pracownika o czas usprawiedliwionej nieobecności. Liczy się nieobecność ciągła albo kilka krótszych, które łącznie przekraczają 3 miesiące, bez względu na przyczynę. Po przedłużeniu umowy przełożony wyznacza nowy termin na sprawozdanie.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 5 ust. 2; Poradnik KPRM 2016 – pierwsza ocena, s. 12–13; ustawa o służbie cywilnej, art. 35 ust. 4 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "B-09",
  "q": "Co musi zawierać sprawozdanie?",
  "a": "Sprawozdanie obejmuje co najmniej 7 przepracowanych miesięcy i jest sporządzane na formularzu z zał. nr 3. Pracownik opisuje zadania z opisu stanowiska i inne istotne zadania, napotkane problemy i sposób ich rozwiązania, zdobytą wiedzę i umiejętności oraz wnioski usprawniające. Złożenie sprawozdania w terminie jest warunkiem oceny pozytywnej.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 6 ust. 1–3, § 10 ust. 1 pkt 2."
 },
 {
  "id": "B-10",
  "q": "Jak wygląda służba przygotowawcza i kto jest zwolniony z egzaminu?",
  "a": "Dyrektor generalny kieruje na nią pracownika, określa jej zakres i czas trwania (najwyżej 4 miesiące, koniec najpóźniej po 8 miesiącach pracy) i ustala zasady egzaminu końcowego. Zaliczenie egzaminu nie jest wymagane od absolwenta KSAP bez wniosku o mianowanie, osoby na zastępstwo i osoby na wyższym stanowisku. Osoba zwolniona indywidualnie ze służby przygotowawczej na wniosek kierującego komórką musi mimo to zdać egzamin.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 10 ust. 3; Poradnik KPRM 2016 – pierwsza ocena, s. 14–16; ustawa o służbie cywilnej, art. 36 ust. 5–8 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "B-11",
  "q": "Kto dokonuje pierwszej oceny i kiedy jest rozmowa oceniająca?",
  "a": "Ocenia bezpośredni przełożony w porozumieniu z kierującym komórką organizacyjną. Rozmowę oceniającą przeprowadzasz niezwłocznie po złożeniu sprawozdania albo po upływie terminu na jego złożenie, a kierujący komórką może w niej uczestniczyć. Omawiasz 5 elementów oceny, wynik egzaminu (jeśli obowiązywał) i sprawozdanie, a możesz też omówić kierunki rozwoju.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 2, § 7 pkt 1, § 8 ust. 1–2; Poradnik KPRM 2016 – pierwsza ocena, s. 27; ustawa o służbie cywilnej, art. 38 ust. 2 (do potwierdzenia z tekstem ustawy)."
 },
 {
  "id": "B-12",
  "q": "Jaka jest skala ocen i kiedy pierwsza ocena jest pozytywna?",
  "a": "Każdy z 5 elementów (rzetelność, wykorzystywanie wiedzy i doskonalenie zawodowe, organizacja pracy i orientacja na osiąganie celów, komunikacja, współpraca) oceniasz na 3, 5 albo 7 pkt, a ocena łączna to ich średnia arytmetyczna. Ocena jest pozytywna tylko przy spełnieniu łącznie czterech warunków: zaliczony egzamin (o ile obowiązywał), sprawozdanie złożone w terminie, najwyżej jedna ocena 3 pkt i ocena łączna co najmniej 5 pkt. Niespełnienie któregokolwiek warunku daje ocenę negatywną.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 2 pkt 1, § 7 pkt 3, § 9 ust. 1, § 10 ust. 1–3."
 },
 {
  "id": "B-13",
  "q": "Przykłady: kiedy wynik jest pozytywny, a kiedy negatywny?",
  "a": "Oceny 5, 7, 5, 5, 3 dają średnią 5,0 i ocenę pozytywną, bo jest tylko jedna ocena 3 pkt, a średnia wynosi co najmniej 5. Średnia 4,6 daje ocenę negatywną. Średnia 5,4 przy zdanym egzaminie też daje negatywną, jeśli sprawozdanie złożono po terminie.",
  "src": "Poradnik KPRM 2016 – pierwsza ocena, s. 30–31 (rys. 15–18); Rozporządzenie PRM z 23.07.2015, § 10 ust. 1–2."
 },
 {
  "id": "B-14",
  "q": "Czy muszę pisać uzasadnienie i wnioski rozwojowe?",
  "a": "Uzasadnienie jest obowiązkowe przy ocenie negatywnej, a przy pozytywnej fakultatywne. Wnioski dotyczące rozwoju zawodowego sporządzasz tylko przy ocenie pozytywnej, fakultatywnie i w porozumieniu z kierującym komórką. Inaczej niż w ocenie okresowej, gdzie wnioski do IPRZ są obowiązkowe przy każdej ocenie.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 10 ust. 4–6; Poradnik KPRM 2016 – pierwsza ocena, s. 32–33; Rozporządzenie PRM z 4.04.2016, § 11 ust. 1 pkt 5."
 },
 {
  "id": "B-15",
  "q": "Co dzieje się po pierwszej ocenie?",
  "a": "Niezwłocznie zapoznajesz pracownika z oceną; oryginał arkusza ze sprawozdaniem i pismami o zmianie terminów trafia do akt osobowych, a pracownik dostaje kopię arkusza. Kierujący komórką składa do dyrektora generalnego wniosek: przy ocenie pozytywnej obowiązkowo o umowę na czas nieokreślony, przy negatywnej o niezawieranie takiej umowy albo o rozwiązanie umowy na czas określony. Bez pozytywnej pierwszej oceny umowy na czas nieokreślony zawrzeć nie można.",
  "src": "Rozporządzenie PRM z 23.07.2015, § 11 ust. 1–2; Poradnik KPRM 2016 – pierwsza ocena, s. 33–34; ustawa o służbie cywilnej, art. 35 ust. 2 i 6, art. 38 ust. 3 (do potwierdzenia z tekstem ustawy)."
 }
]
