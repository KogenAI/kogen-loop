Feature: Loop owns exact cut bytes
  Scenario Outline: Recorded output matches the existing fixture delivery
    When I cut the line-alignment fixture "<fixture>"
    Then the local cut recording for "<fixture>" equals head unit "<unit>" repeated <head> and marker "<marker>" and tail unit repeated <tail>

    Examples:
      | fixture | unit | head | marker                        | tail  |
      | lines   | line | 51   | [... 23680 bytes omitted ...] | 153   |
      | single  | x    | 4096 | [... 13647 bytes omitted ...] | 12257 |
      | unicode | €    | 1365 | [... 13650 bytes omitted ...] | 4085  |
      | 16383   | x    | 16383|                               | 0     |
      | 16384   | x    | 16384|                               | 0     |
      | 16385   | x    | 4096 | [... 32 bytes omitted ...]    | 12257 |
