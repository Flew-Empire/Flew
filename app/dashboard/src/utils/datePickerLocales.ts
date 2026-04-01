import fa from "date-fns/locale/fa-IR";
import ru from "date-fns/locale/ru";
import zh from "date-fns/locale/zh-CN";
import { registerLocale } from "react-datepicker";

let isRegistered = false;

export const registerDatePickerLocales = () => {
  if (isRegistered) {
    return;
  }

  registerLocale("zh-cn", zh);
  registerLocale("ru", ru);
  registerLocale("fa", fa);
  isRegistered = true;
};
