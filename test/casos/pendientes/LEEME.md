# Casos parados por el carrete

Estos dos casos no corren: el runner solo lee `test/casos/*.mjs` y esta carpeta
queda afuera. **No están rotos por un descuido — están esperando que alguien los
vuelva a apuntar**, y se guardan enteros porque lo que comprueban sigue siendo
verdad; lo que cambió es dónde se lee.

| Caso | Qué comprueba | Por qué quedó parado |
|---|---|---|
| `tope-100` | Ninguna tarea aporta más que su meta, y qué entra en el techo de cada día | Sus números están calculados para ventanas de una semana y de un mes. Con la lista del día, el porcentaje por tarea es **mensual** (el chip de cada fila) y el del pie es **de un día**: los mismos invariantes, otros valores esperados |
| `periodos-parciales` | A un período partido por el borde del mes o de la vista se le pide solo la parte visible | La mitad de sus casos parten el período por el borde de la *vista*, que ya no existe. La otra mitad —el borde del **mes**— sigue valiendo tal cual |

La matemática no se tocó: `taskTotals`, `rangeTotals`, `aporte` y `complianceOf`
son las mismas funciones de siempre. Lo único que cambió es qué conjunto de días
se les pasa, y por lo tanto desde qué parte de la pantalla se leen los
resultados:

- el chip `.dia-mes` de cada fila → `taskTotals(task, monthDays())`
- `#dia-pie-valor` → `rangeTotals([día])`

Reapuntarlos es recalcular los valores esperados contra esos dos lugares.
