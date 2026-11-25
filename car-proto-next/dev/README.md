# car-proto-next/dev

Всё для разработки CHUBZ. В игру ничего отсюда не подключается.

- `HANDOFF.md`: состояние игры и команды. С него начинает каждая новая сессия.
- `RULES.md`: правила работы и слова Романа.
- `harness/`: сборка тест-страницы и запуск игры в headless-браузере.
  - `build.py`: тест-страница — сборка игры в режиме `test` (`vite-test.js` ставит реестр `window.__dbg` по `names.txt`). Старую одиночную страницу (билд 136 и раньше) собирает по-старому, вклейками по якорям: `--src ../../../car-proto/index.html`.
  - `hx.js`: часы кадра для тестов, init-скрипт Playwright; игра читает их как `HX`.
  - `names.txt`: что видно тестам через `window.__dbg`. Имя, которого в игре больше нет, роняет запуск с названием имени.
  - `game.py`: `Game` (сервер, браузер, соло и лобби на двоих), `ev`, `wait`, `freeze`/`step`, `sheet`, `Checks`. Каждая страница живёт в дне 2026-01-01 со своим посеянным `Math.random`; `CHUBZ_SEED=` и `CHUBZ_DAY=` (или `today`) меняют их.
  - `mock_room.js`, `trystero_shim.js`: сеть между вкладками одного браузера вместо настоящей.
- `tests/`: проверки с ответом «прошло или нет». `run.py` гоняет все.
- `frames.py`, `frames/r128/`: эталонные кадры восьми сцен и их сравнение (тест `frames`).
- `booth.py`: фотобудка для моделей.
- `film.py`: покадровая съёмка в GIF.
- `tools/nanogpt_gen.py`: генерация картинок, ключ из переменной `NANOGPT_KEY`.
- `tools/sprite_cut.py sheet.png out_dir --names a,b,c`: режет спрайт-лист на плоском фоне в RGBA WebP и data URI для `ART_SRC`.
- `music/`: офлайн-партитура и сведение темы.
- `refs/`: принятые образцы.

```
cd car-proto/dev
python3 run.py                      # все тесты
python3 run.py -k bomb -v           # один, с подробностями
python3 booth.py "d.makeHand()" --turns 0,180 --lift 2 -o /tmp/hand.png
python3 film.py --help              # там же пример съёмки руки
```

Новый тест: файл `tests/test_<имя>.py` по образцу соседних. `Game()` для логики (быстро, без отрисовки), `Game(fast=False)` для картинок.
