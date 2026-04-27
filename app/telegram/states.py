from aiogram.fsm.state import State, StatesGroup


class Gen(StatesGroup):
    modality = State()
    model    = State()
    prompt   = State()
    confirm  = State()
