# Proces-verbal: the church's format

The PDF of a meeting (`meetingPrint` in `src/domain/print.ts`) follows the format of the minutes
Maranata Stavanger already keeps. The unit test `src/domain/print.test.ts` builds the example below
and compares `printToText` with the text block line by line.

## Format

```text
Proces verbal nr. <nr>
Încheiat azi, <ZZ.LL.AAAA>, cu ocazia ședinței de <tip, lowercase: comitet / adunare generală / …>.
La ședință au fost prezenți: <n> membri.
<names, comma separated, Nume Prenume order (as in the app, memberName)>
Nume | Semnătura                (one row per person present, except the Secretar and the Pastor below:
                                 the drawn signature, or a line to sign on paper)
[Semnat pe hârtie de: <names>]  (the rows marked „Semnat pe hârtie”: their line stays empty)
[Absenți: <names>]            (only when absentees exist)
[Invitați: <names>]
În cadrul ședinței s-au discutat și aprobat următoarele:
1. <punct>
2. <punct>
Toate punctele au fost votate în unanimitate de membrii prezenți.   (editable closing sentence; default text)
Întocmit,
Secretar                              Pastor
<full name, wrapped when long>        <full name>
Semnătura                             Semnătura
[drawn signature above the line, „semnat <data ora>” / „semnat pe hârtie” under it]
```

Optional lines the app adds only when they have content: `Cvorum: …` (after Absenți, for meeting
types with an attendance rule), `Ordinea de zi: …` (meetings that have one, before the points) and
`Observații: …` (after the points). A meeting without a number prints `Proces verbal` alone.
A closed meeting has `Proces-verbal închis la <ZZ.LL.AAAA HH:MM>` at the bottom of every page.

The Secretar and the Pastor named in Setări sign only in the „Întocmit” block: when they are among
those present they stay in the names and the count, but not in the table (MINUTES-SIGNATURES; the name
is matched in any word order, titles ignored). The letterhead writes the church's name once: a name
that already starts with „Biserica” gets no prefix (`churchTitle`).

## Example

Comitet meeting no. 16 of 11.09.2026, five persons present: the secretary (Ioana Pop) and the pastor
(Daniel Mureșan) sign at the bottom (the secretary on the tablet, the pastor on paper), one of the other
three signed on the tablet and one on paper; one absent, one guest, three points. `printToText` puts
the church name on the first line and joins the two signature columns with ` | `.

```text
Biserica Maranata Stavanger
Proces verbal nr. 16
Încheiat azi, 11.09.2026, cu ocazia ședinței de comitet.
La ședință au fost prezenți: 5 membri.
Ionescu Mihai, Mureșan Daniel, Pop Ioana, Popescu Ion, Ștefănescu Petru
Nume | Semnătura
Ionescu Mihai | semnat 11.09.2026 19:42
Popescu Ion | ________________
Ștefănescu Petru | ________________
Semnat pe hârtie de: Popescu Ion.
Absenți: Ciobanu Emanuel
Invitați: Lucia Avram
În cadrul ședinței s-au discutat și aprobat următoarele:
1. Ziua Recoltei va avea loc pe 4 octombrie, cu agapă comună.
2. Seara de evanghelizare: invitat pastor Ioan Bunaciu.
3. Conferința tinerilor se amână pentru primăvară.
Toate punctele au fost votate în unanimitate de membrii prezenți.
Întocmit,
Secretar | Pastor
Ioana Pop | Daniel Mureșan
Semnătura | Semnătura
[semnătură] semnat 11.09.2026 19:50 | semnat pe hârtie
```
