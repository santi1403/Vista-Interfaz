event inq : 10
    var h : N9
    var ck : A32
    var url : A250

    ck = @CKNUM

    if @CKNUM = 0
        infomessage "Abra una cuenta (check) antes de asignar cliente."
    else
        url = "http://127.0.0.1:8000/index.html?pos=1&check=" && ck
        infomessage url
        DLLLoad h, "shell32.dll"
        if h <> 0
            DLLCall_STDCall h, ShellExecuteA(0, "open", url, "", "", 1)
            DLLFree h
        else
            infomessage "No se pudo cargar shell32.dll"
        endif
    endif
endevent
