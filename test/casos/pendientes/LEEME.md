# Casos parados por el carrete

Estos dos casos no corren: el runner solo lee `test/casos/*.mjs` y esta carpeta
queda afuera. **No están rotos por un descuido — están esperando que alguien los
vuelva a apuntar**, y se guardan enteros porque lo que comprueban sigue siendo
verdad; lo que cambió es dónde se lee.

| Caso | Qué comprueba | Por qué quedó parado |
|---|---|---|
| `tope-100` | Ninguna tarea aporta más que su meta, y qué entra en el techo de cada día | Sus números están calculados para ventanas de una semana y de un mes. Con la lista del día, el porcentaje por tarea es **mensual** (el chip de cada fila) y el del pie es **de un día**: los mismos invariantes, otros valores esperados |
| `periodos-parciales` | A un período partido por el borde del mes o de la vista se le pide solo la parte visible | La mitad de sus casos parten el período por el borde de la *vista*, que ya no existe. La otra mitad —el borde del **mes**— sigue valiendo tal cual |

La matemática por tarea no se tocó: `taskTotals` y `complianceOf` son las mismas
funciones de siempre. Lo que cambió es qué conjunto de días se les pasa —y por lo
tanto desde qué parte de la pantalla se leen los resultados— y quién contesta por
el día entero:

- el chip `.dia-mes` de cada fila → `taskTotals(task, monthDays())`
- el resumen del día → `dayCompliance(día)`, la misma cuenta del gráfico de barras

Ojo con `tope-100`: **el tope por tarea ya no rige para el día**. `rangeTotals` y
`aporte` se fueron con él, porque el resumen del día era su único lugar. Lo que
se hizo un día que no lo pedía ahora suma 1 de 1 ahí, que es lo que la fila
encendida venía mostrando. El tope sigue vivo donde sí es una pregunta por
tarea: la barra de cada una, que `complianceOf` corta en 100%.

Reapuntarlos es recalcular los valores esperados contra esos dos lugares.
