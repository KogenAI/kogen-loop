module budget {
 var over: bool
 var condensed: bool
 var sent: bool
 action init = all { over' = false, condensed' = false, sent' = false }
 action step = any {
 all { over' = true, condensed' = false, sent' = false },
 all { over' = false, condensed' = true, sent' = false },
 all { not(over), sent' = true, over' = over, condensed' = condensed }
 }
 val SafeSend = sent implies not(over)
}
