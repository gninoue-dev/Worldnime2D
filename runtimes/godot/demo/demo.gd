# Démo : le personnage joue « leve » en boucle ; Espace relance l'animation avec un fondu.
extends Node2D

@onready var perso: Worldnime2DSkeleton = $Perso


func _ready() -> void:
	perso.event_triggered.connect(func(track, name, data): print("Événement : ", name, " (piste ", track, ")"))


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept"):
		perso.set_animation(0, "leve", true)
