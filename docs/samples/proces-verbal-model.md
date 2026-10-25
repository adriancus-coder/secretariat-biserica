# Proces-verbal: the church's format

The PDF of a meeting (`meetingPrint` in `src/domain/print.ts`) follows the format of the minutes
Maranata Stavanger already keeps. The unit test `src/domain/print.test.ts` builds the example below
and compares `printToText` with the text block line by line.

## Format

```text
Proces verbal nr. <nr>
Încheiat azi, <ZZ.LL.AAAA>, cu ocazia ședinței de <tip, lowercase: comitet / adunare generală / …>.
La ședință au fost prezenți: <n> membri.
<names, comma separated, Prenume Nume order>
Nume | Semnătura                (one row per person present: the drawn signature, or a line to sign on paper)
[Absenți: <names>]            (only when absentees exist)
[Invitați: <names>]
În cadrul ședinței s-au discutat și aprobat următoarele:
1. <punct>
2. <punct>
Toate punctele au fost votate în unanimitate de membrii prezenți.   (editable closing sentence; default text)
Întocmit,
Secretar, <nume>                      Pastor, <nume>
Semnătura                             Semnătura
```

Optional lines the app adds only when they have content: `Cvorum: …` (after Absenți, for meeting
types with an attendance rule), `Ordinea de zi: …` (meetings that have one, before the points) and
`Observații: …` (after the points). A meeting without a number prints `Proces verbal` alone.
A closed meeting has `Proces-verbal închis la <ZZ.LL.AAAA HH:MM>` at the bottom of every page.

## Example

Comitet meeting no. 16 of 11.09.2026, five persons present (two signed on the tablet), one absent, one guest, three points.
`printToText` puts the church name on the first line and joins the two signature columns with ` | `.

```text
Biserica Maranata Stavanger
Proces verbal nr. 16
Încheiat azi, 11.09.2026, cu ocazia ședinței de comitet.
La ședință au fost prezenți: 5 membri.
Mihai Ionescu, Daniel Mureșan, Ioana Pop, Ion Popescu, Petru Ștefănescu
Nume | Semnătura
Mihai Ionescu | semnat 11.09.2026 19:42
Daniel Mureșan | semnat 11.09.2026 19:43
Ioana Pop | ________________
Ion Popescu | ________________
Petru Ștefănescu | ________________
Absenți: Emanuel Ciobanu
Invitați: Lucia Avram
În cadrul ședinței s-au discutat și aprobat următoarele:
1. Ziua Recoltei va avea loc pe 4 octombrie, cu agapă comună.
2. Seara de evanghelizare: invitat pastor Ioan Bunaciu.
3. Conferința tinerilor se amână pentru primăvară.
Toate punctele au fost votate în unanimitate de membrii prezenți.
Întocmit,
Secretar, Ioana Pop | Pastor, Daniel Mureșan
Semnătura | Semnătura
```
